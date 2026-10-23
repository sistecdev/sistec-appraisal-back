// A small in-memory limiter for sign-in and password-reset requests — enough
// for the single server this runs on. Counts per IP + email.
const rateLimit = ({ windowMs, max, message }) => {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    const key = `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ success: false, message });
    }
    return next();
  };
};

module.exports = { rateLimit };
