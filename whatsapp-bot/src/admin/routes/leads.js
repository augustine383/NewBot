const express = require('express');
const router = express.Router();
const db = require('../../db/database');

// GET /api/leads
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;
    let leads;
    if (status) {
      const { rows } = await db.query(
        `SELECT * FROM leads WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
        [status, limit]
      );
      leads = rows;
    } else {
      leads = await db.getLeads(limit);
    }
    res.json({ leads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/leads/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['new', 'contacted', 'converted', 'lost'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await db.updateLeadStatus(req.params.id, status);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leads/export (CSV)
router.get('/export', async (req, res) => {
  try {
    const leads = await db.getLeads(1000);
    const header = 'ID,Name,Phone,Service,Budget,Timeline,Status,Created\n';
    const rows = leads.map(l =>
      `${l.id},"${l.name || ''}","${l.phone}","${l.service || ''}","${l.budget || ''}","${l.timeline || ''}","${l.status}","${l.created_at}"`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    res.send(header + rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
