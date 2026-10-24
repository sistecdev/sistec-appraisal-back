const express = require('express');
const multer = require('multer');
const c = require('../controllers/appraisalController');
const { protect, passwordChosen } = require('../middleware/auth');

const router = express.Router();

// One proof file, 5 MB at most.
const PROOF_MB = 5;
const proofUpload = (req, res, next) => multer({ storage: multer.memoryStorage(), limits: { fileSize: PROOF_MB * 1024 * 1024, files: 1 } })
  .single('file')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? `The file is too big (${PROOF_MB} MB at most)` : 'Could not read the file';
    return res.status(400).json({ success: false, message });
  });

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
router.post('/appraisals/:id/proofs', proofUpload, c.addProof);
router.get('/appraisals/:id/proofs/:proofId', c.getProof);
router.delete('/appraisals/:id/proofs/:proofId', c.removeProof);
router.put('/appraisals/:id/review', c.saveReview);
router.put('/appraisals/:id/comment', c.saveComment);
router.post('/appraisals/:id/forward', c.forward);
router.post('/appraisals/:id/send-back', c.sendBack);

module.exports = router;
