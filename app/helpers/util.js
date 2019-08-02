module.exports = {
  loggedIn: (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/');
    }
    next()
  },
  positionEnum: ["Manager", "Software Developers", "Quality Assurance", "Software Engineer"]
}
