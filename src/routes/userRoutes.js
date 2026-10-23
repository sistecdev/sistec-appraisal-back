const express = require('express');
const multer = require('multer');
const c = require('../controllers/userController');
const { protect, passwordChosen, hrOnly } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

// Account management — HR only.
router.use(protect, passwordChosen, hrOnly);

router.get('/', c.list);
router.post('/', c.create);
router.get('/import/template', c.importTemplate);
router.post('/import/preview', upload.single('file'), c.importPreview);
router.post('/import', c.importCreate);
router.put('/:id', c.update);
router.patch('/:id/active', c.setActive);
router.post('/:id/access', c.resendAccess);

module.exports = router;
