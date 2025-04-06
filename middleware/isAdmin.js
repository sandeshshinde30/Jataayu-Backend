const isAdmin = (req, res, next) => {
  // Check if user exists and has admin or Official_member role
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'Official_member')) {
    return res.status(403).json({ message: 'Access denied. Admin or Official member only.' });
  }
  next();
};

module.exports = isAdmin; 