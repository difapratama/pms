var express = require('express');
var router = express.Router();
var helpers = require('../helpers/util');

module.exports = function (pool) {

    router.get('/', helpers.loggedIn, function (req, res, next) {
        //console.log('terkoneksi');
        pool.query(`SELECT * from users where userid = ${req.session.user}`, (err, data) => {
            //console.log(data.rows);
            if (err) {
                console.log('aaaaaaaaaaaaaaaaaa', data);
                
                console.log(err);
            }
            res.render('profile/view', { data: data.rows[0] })
        })
    })

    router.post('/:id', (req, res, next) => {
        //console.log(req.body);
        
        let password = req.body.formpass;
        let position = req.body.position;

        let sql = `UPDATE users SET password = '${password}', position = '${position}', type = ${(req.body.type ? true : false)} where userid = ${req.session.user}`
        pool.query(sql, (err) => {
            //console.log(sql);
            if (err) {
                console.log(err);
            }
            res.redirect('/profile')
        })
    })

    return router;
};