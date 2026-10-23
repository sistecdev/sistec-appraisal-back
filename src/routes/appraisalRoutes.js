const express = require('express');
const c = require('../controllers/appraisalController');
const { protect, passwordChosen } = require('../middleware/auth');

const router = express.Router();

// Every signed-in account. Who may do what (HR, the person at a step of a
// form, the appraisee) is decided per action in the controller.
router.use(protect, passwordChosen);

router.get('/template', c.getTemplate);
router.get('/me', c.getMyRoles);

// HR
router.get('/people', c.listPeople);
router.post('/cycles', c.releaseCycle);
router.get('/cycles', c.listCycles);
router.get('/cycles/:id', c.getCycle);
router.patch('/cycles/:id', c.updateCycle);
router.post('/cycles/:id/people', c.addToCycle);
router.delete('/cycles/:id', c.deleteCycle);
router.get('/cycles/:id/download', c.downloadCycle);
router.patch('/appraisals/:id/assignee', c.setAssignee);

// Lists
router.get('/mine', c.listMine);
router.get('/review', c.listForReview);

// One form
router.get('/appraisals/:id', c.getAppraisal);
router.get('/appraisals/:id/download', c.downloadOne);
router.put('/appraisals/:id/self', c.saveSelf);
router.post('/appraisals/:id/refill', c.refillSelf);
router.post('/appraisals/:id/submit', c.submitSelf);
router.put('/appraisals/:id/review', c.saveReview);
router.put('/appraisals/:id/comment', c.saveComment);
router.post('/appraisals/:id/forward', c.forward);
router.post('/appraisals/:id/send-back', c.sendBack);

module.exports = router;
