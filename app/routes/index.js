var express = require('express');
var router = express.Router();
//var models = require('../models/index');


module.exports = function (pool) {

  // ========== LOGIN ==========

  router.get('/', function (req, res, next) {
    res.render('login', { loginMessage: req.flash('loginMessage') });
  });

  router.post('/', function (req, res, next) {

    let emails = req.body.email;
    let passwords = req.body.password;

    pool.query(`SELECT * FROM users where email='${emails}' and password='${passwords}'`, (err, data) => {
      if (err) return res.send(err)
      if (data.rows.length == 0) {
        req.flash('loginMessage', 'Email atau Password Salah');
        res.redirect("/");

      } else {
        req.session.status = data.rows[0].status
        req.session.user = data.rows[0].userid;
        res.redirect("/projects");
      }
    })
  });

  router.get('/logout', function (req, res, next) {
    req.session.destroy(() => {
      res.redirect('/')
    })
  })
  return router;
};