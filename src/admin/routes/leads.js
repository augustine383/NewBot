const express = require('express');
const router  = express.Router();
const db      = require('../../db/database');

// GET /api/leads
router.get('/', async (req, res) => {
  try {
    const limit  = parseInt(req.query.limit) || 50;
    const status = req.query.status;
    let rows;
    if (status) {
      rows = await db.rawQuery(
        `SELECT * FROM leads WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
        [status, limit]
      );
    } else {
      rows = await db.rawQuery(
        `SELECT * FROM leads ORDER BY created_at DESC LIMIT $1`, [limit]
      );
    }
    res.json({ leads: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/leads/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const valid = ['new', 'contacted', 'converted', 'lost'];
    if (!valid.includes(req.body.status))
      return res.status(400).json({ error: 'Invalid status' });
    await db.updateLeadStatus(req.params.id, req.body.status);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/leads/export
router.get('/export', async (req, res) => {
  try {
    const leads = await db.getLeads(1000);
    const header = 'ID,Name,Phone,Service,Budget,Timeline,Status,Created\n';
    const rows = leads.map(l =>
      `${l.id},"${l.name||''}","${l.phone}","${l.service||''}","${l.budget||''}","${l.timeline||''}","${l.status}","${l.created_at}"`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(header + rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
