/**
 * send-task-reminders/index.ts
 * ----------------------------
 * Edge Function Supabase appelée chaque jour par cron-job.org.
 * 
 * Logique :
 *  1. Cherche toutes les tâches dues aujourd'hui ou demain
 *  2. Filtre : non terminées + assignées à un employé avec un email
 *  3. Évite les doublons : ignore les tâches déjà notifiées aujourd'hui
 *  4. Envoie un email via Resend pour chaque tâche concernée
 *  5. Met à jour notified_at pour éviter les re-envois
 *
 * Variables d'environnement requises (Supabase → Edge Functions → Secrets) :
 *  - RESEND_API_KEY   : clé API Resend (resend.com)
 *  - FROM_EMAIL       : adresse d'expédition (ex: rappels@votre-domaine.com)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Client admin — bypasse le RLS pour lire toutes les tâches
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'rappels@mindmap-collab.com'

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY manquant' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const today    = new Date().toISOString().split('T')[0]
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  // Chercher les tâches dues aujourd'hui ou demain
  // avec un employé assigné et un email valide
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select(`
      id,
      content,
      due_date,
      notified_at,
      employee:assigned_to (
        first_name,
        last_name,
        email
      ),
      node:node_id (
        title
      )
    `)
    .in('due_date', [today, tomorrow])
    .eq('done', false)
    .not('assigned_to', 'is', null)

  if (tasksError) {
    return new Response(JSON.stringify({ error: tasksError.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const results = []
  let sent = 0
  let skipped = 0

  for (const task of tasks ?? []) {
    const employee = task.employee
    const businessName = task.node?.title || 'Votre projet'

    // Ignorer si pas d'email
    if (!employee?.email?.trim()) { skipped++; continue }

    // Ignorer si déjà notifié aujourd'hui
    if (task.notified_at === today) { skipped++; continue }

    const isToday  = task.due_date === today
    const urgency  = isToday ? '🔴 AUJOURD\'HUI' : '⚠️ Demain'
    const color    = isToday ? '#ef4444' : '#f97316'

    // Construire et envoyer l'email via Resend
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `MindMap Collab <${FROM_EMAIL}>`,
        to: [employee.email],
        subject: `${urgency} — ${task.content} (${businessName})`,
        html: `
          <!DOCTYPE html>
          <html>
          <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
            <div style="max-width:520px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
              
              <!-- Header -->
              <div style="background:#1a1d24;padding:24px 28px;">
                <div style="font-size:22px;margin-bottom:4px;">🧠 MindMap Collab</div>
                <div style="color:#9aa4b2;font-size:13px;">Rappel de tâche automatique</div>
              </div>

              <!-- Body -->
              <div style="padding:28px;">
                <p style="margin:0 0 8px;color:#444;font-size:15px;">
                  Bonjour <strong>${employee.first_name}</strong>,
                </p>
                <p style="margin:0 0 20px;color:#666;font-size:14px;">
                  Une tâche qui vous a été assignée arrive à échéance.
                </p>

                <!-- Task card -->
                <div style="background:#f8f8f9;border-radius:8px;padding:16px 20px;border-left:4px solid ${color};margin-bottom:20px;">
                  <div style="font-size:16px;font-weight:700;color:#1a1d24;margin-bottom:10px;">
                    ${task.content}
                  </div>
                  <div style="font-size:13px;color:#666;margin-bottom:6px;">
                    🏢 <strong>${businessName}</strong>
                  </div>
                  <div style="font-size:13px;font-weight:700;color:${color};">
                    📅 Échéance : ${urgency} (${task.due_date})
                  </div>
                </div>

                <p style="margin:0;color:#888;font-size:12px;line-height:1.5;">
                  Ce rappel est envoyé automatiquement par MindMap Collaborative.<br>
                  Connectez-vous pour marquer la tâche comme terminée.
                </p>
              </div>

            </div>
          </body>
          </html>
        `,
      }),
    })

    const emailData = await emailRes.json()

    if (emailRes.ok) {
      // Mettre à jour notified_at pour éviter un re-envoi le même jour
      await supabase.from('tasks').update({ notified_at: today }).eq('id', task.id)
      sent++
      results.push({ task: task.content, to: employee.email, status: 'sent' })
    } else {
      results.push({ task: task.content, to: employee.email, status: 'failed', error: emailData.message })
    }
  }

  return new Response(JSON.stringify({
    success: true,
    date: today,
    sent,
    skipped,
    total: tasks?.length ?? 0,
    results,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
})
