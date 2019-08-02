const express = require('express');
const router = express.Router();
const { isLogged, pool } = require('../helpers/util');
const moment = require('moment')

// =========  HOME   ============


router.get('/', isLogged, function (req, res, next) {
    let url = req.query.page ? req.url : '/?page=1';
    let page = req.query.page || 1;
    let limit = 3;
    let offset = (page - 1) * limit
    let searching = false;
    let params = [];
    let email = req.session.user.email
    let role = req.session.user.role


    if (req.query.cid && req.query.id) {
        params.push(`projects.project_id = ${req.query.id}`);
        searching = true;
    }

    if (req.query.cname && req.query.name) {
        params.push(`projects.project_name ilike '%${req.query.name}%'`);
        searching = true;
    }

    if (req.query.cmember && req.query.member) {
        params.push(`CONCAT (users.first_name,' ',users.last_name) = '${req.query.member}'`);
        searching = true;
    }

    let sqlA = `select distinct projects.project_id, projects.project_name from projects 
  LEFT JOIN members ON projects.project_id = members.project_id
  LEFT JOIN users ON members.user_id = users.user_id`
    if (searching) {
        sqlA += ` where ${params.join(' AND ')}`
    }
    sqlA += ` ORDER BY projects.project_id LIMIT ${limit} OFFSET ${offset}`

    let subquery = `select project_id from projects`

    if (searching) {
        subquery += ` where ${params.join(' AND ')}`
    }
    subquery += ` ORDER BY project_id LIMIT ${limit} OFFSET ${offset}`
    let sqlB = `SELECT projects.project_id, CONCAT (users.first_name,' ',users.last_name) AS fullname  
  FROM members 
  INNER JOIN projects ON members.project_id = projects.project_id
  INNER JOIN users ON users.user_id = members.user_id WHERE projects.project_id IN 
  (${subquery})`;

    let sekece = `select count(*) as total from projects 
  LEFT JOIN members ON projects.project_id = members.project_id
  LEFT JOIN users ON members.user_id = users.user_id`
    if (searching) {
        sekece += ` where ${params.join(' AND ')}`
    }

    pool.query(sekece, (err, total) => {
        let totalPages = total.rows[0].total;
        let pages = Math.ceil(totalPages / limit)
        pool.query(`SELECT config FROM users WHERE email = '${email}'`, (err, config) => {
            pool.query(sqlA, [], (err, project) => {
                pool.query(sqlB, [], (err, member) => {
                    pool.query(`select * from users ORDER BY user_id`, [], (err, users) => {
                        project.rows.map(snap => {
                            snap.members = member.rows.filter(item => {
                                return item.project_id == snap.project_id
                            }).map(item => item.fullname)
                        })
                        res.render('projects', {
                            data: project.rows,
                            config: config.rows[0].config,
                            users: users.rows,
                            pagination: { pages, page, total, url },
                            role
                        })
                    })

                })
            })
        })
    })


});


router.get('/config', isLogged, function (req, res) {
    let email = req.session.user.email;
    let stable = {};

    req.query.sid ? stable.sid = true : stable.sid = false
    req.query.sname ? stable.sname = true : stable.sname = false
    req.query.smembers ? stable.smembers = true : stable.smembers = false



    pool.query(`UPDATE users SET config = '{"sid" : ${stable.sid}, "sname" : ${stable.sname}, "smembers" : ${stable.smembers} }' WHERE email = '${email}'`, (err) => {
        res.redirect('/')
    })

});


// =========  PROJECT MEMBERS   ============
router.get('/project_members/:projectid', isLogged, function (req, res) {
    let projectid = req.params.projectid
    let email = req.session.user.email;
    let url = req.query.page ? req.url : `?page=1`;
    let page = req.query.page || 1;
    let limit = 3;
    let offset = (page - 1) * limit
    let searchingMode = false;
    let params = [];

    let sqlConfig = `SELECT config_members FROM users WHERE email = '${email}'`

    if (req.query.cid && req.query.id) {
        params.push(`user_id = ${req.query.id}`)
        searchingMode = true;

    }

    if (req.query.cname && req.query.name) {
        params.push(`CONCAT (first_name,' ',last_name) ilike '%${req.query.name}%'`)
        searchingMode = true;
    }
    if (req.query.cposition && req.query.position) {
        params.push(`position ilike '%${req.query.position}%'`)
        searchingMode = true;
    }

    let sql = `SELECT COUNT(*) AS total FROM users WHERE user_id IN (SELECT user_id FROM members WHERE project_id = ${projectid} )`
    if (searchingMode) {
        sql += ` AND ${params.join(' AND ')}`
    }

    pool.query(sql, (err, totalPages) => {
        let total = totalPages.rows[0].total;
        let pages = Math.ceil(total / limit);
        let sql = `SELECT position,user_id ,CONCAT(first_name,' ',last_name) as fullname FROM users WHERE user_id IN (SELECT user_id FROM members WHERE project_id = ${projectid} )`
        if (searchingMode) {
            sql += ` AND ${params.join(' AND ')}`
        }

        pool.query(sql, (err, data) => {
            pool.query(sqlConfig, (err, config) => {
                res.render('project_members',
                    {
                        projectid: projectid,
                        data: data.rows,
                        config: config.rows[0].config_members,
                        pagination: { pages, url, page, total }
                    })
            })
        })


    });

})

router.get('/config_members/:id', isLogged, function (req, res) {
    let email = req.session.user.email;
    let stable = {};

    req.query.smid ? stable.smid = true : stable.smid = false
    req.query.smname ? stable.smname = true : stable.smname = false
    req.query.smposition ? stable.smposition = true : stable.smposition = false


    let sql = `UPDATE users SET config_members = '{"smid" : ${stable.smid}, "smname" : ${stable.smname}, "smposition" : ${stable.smposition}}' WHERE email = '${email}'`
    pool.query(sql, (err) => {
        if (err) throw err
        res.redirect(`/project_members/${req.params.id}`)
    })

})
router.get('/add_MemberProject/:projectid', isLogged, function (req, res) {
    let projectid = req.params.projectid;
    let sql = `SELECT user_id,CONCAT(first_name,' ',last_name) as fullname from users WHERE user_id NOT IN (SELECT user_id from members where project_id =${projectid})`

    pool.query(sql, (err, data) => {
        res.render('addProjectMember', { data: data.rows, projectid })
    })

})

router.post('/add_MemberProject', isLogged, function (req, res) {
    let userid = Number(req.body.userid);
    let projectid = Number(req.body.projectid);
    let position = `${req.body.position}` || ''

    let sql = `INSERT INTO public.members(
    user_id, project_id, role)
    VALUES (${userid}, ${projectid}, '${position}')`

    pool.query(sql, (err) => {
        if (err) console.log(err)
        res.redirect(`/project_members/${projectid}`)
    })

})

router.get('/delete_member/:projectid/:userid', isLogged, function (req, res) {
    let page = `page=${req.query.page}` || `page=1`
    let sql = `DELETE FROM members WHERE project_id = ${req.params.projectid} AND user_id = ${req.params.userid}`

    pool.query(sql, (err) => {
        if (err) throw err
        res.redirect(`/project_members/${req.params.projectid}?${page}`)
    })


})

// =========  PROJECT ISSUES   ============

router.get('/project_issues/:projectid', isLogged, function (req, res) {
    let projectid = Number(req.params.projectid)
    let email = req.session.user.email;
    let url = req.query.page ? req.url : `?page=1`;
    let page = req.query.page || 1;
    let limit = 3;
    let offset = (page - 1) * limit
    let searchingMode = false;
    let params = [];



    if (req.query.isid && req.query.issueid) {
        params.push(`issues.issue_id = '${req.query.issueid}'`)
        searchingMode = true;
    }

    if (req.query.subname && req.query.subject) {
        params.push(`issues.subject ilike '%${req.query.subject}%'`)
        searchingMode = true;
    }

    if (req.query.ctracker && req.query.tracker) {
        params.push(`issues.tracker = '${req.query.tracker}'`)
        searchingMode = true;
    }

    let sql = `SELECT COUNT(*) AS total FROM issues WHERE project_id = ${projectid}`;
    if (searchingMode) {
        sql += ` AND ${params.join(' AND ')}`
    }

    pool.query(sql, (err, totalPages) => {
        let total = totalPages.rows[0].total;
        let pages = Math.ceil(total / limit);

        sql = `SELECT * FROM issues WHERE project_id = ${projectid}`;
        if (searchingMode) {
            sql += ` AND ${params.join(' AND ')}`
        }
        sql += ` ORDER BY project_id LIMIT ${limit} OFFSET ${offset}`;
        pool.query(sql, (err, dataissues) => {
            pool.query(`SELECT config_issues FROM users WHERE email = '${email}'`, (err, config) => {

                res.render('project_issues', {
                    projectid: projectid,
                    data: dataissues.rows,
                    config: config.rows[0].config_issues,
                    pagination: { pages, url, page, total }
                })
            })
        })
    })


})

router.get('/config_issues/:id', isLogged, function (req, res) {
    let email = req.session.user.email;
    let stable = {};

    req.query.siid ? stable.siid = true : stable.siid = false
    req.query.sisubject ? stable.sisubject = true : stable.sisubject = false
    req.query.sitracker ? stable.sitracker = true : stable.sitracker = false
    req.query.sipriority ? stable.sipriority = true : stable.sipriority = false

    let sql = `UPDATE users SET config_issues = '{"siid" : ${stable.siid}, "sisubject" : ${stable.sisubject}, "sitracker" : ${stable.sitracker} ,"sipriority":${stable.sipriority}}' WHERE email = '${email}'`
    pool.query(sql, (err) => {
        if (err) throw err
        res.redirect(`/project_issues/${req.params.id}`)
    })



})

router.get('/add_projectissue/:id', isLogged, function (req, res) {
    let projectid = Number(req.params.id)
    let sqlmembers = `SELECT CONCAT(first_name,' ',last_name) AS fullname,members.user_id  
  from members LEFT JOIN users ON members.user_id = users.user_id  
  WHERE members.project_id = ${projectid}`

    pool.query(sqlmembers, (err, membersName) => {
        pool.query(`select project_name from projects where project_id = ${req.params.id}`, (err, data) => {

            res.render('addProjectIssue', {
                projectid: projectid,
                projectname: data.rows[0].project_name,
                assigner: membersName.rows
            })
        })
    })

});

router.post('/add_projectissue/:id', isLogged, function (req, res) {
    let x = req.body;
    let file = req.files.filedoc
    let filename = file.name.toLowerCase().replace(/ /g, '');
    let fileloc = `file_upload/${filename}`
    let date = new Date();

    //logger by activity
    let hari = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    let sqLog = `INSERT INTO activities (project_id,time, description,author) VALUES ($1,$2,$3,$4)`
    let note = `ADD NEW ISSUE : ${x.subject}`
    let author = `${req.session.user.first_name} ${req.session.user.last_name}`


    let sql = `INSERT INTO issues
      (project_id, tracker, subject, description, status, priority, assigner, start_date, due_date, estimated_time, done, files)
      VALUES (${Number(x.projectid)},'${x.tracker}','${x.subject}','${x.description}','${x.status}','${x.priority}',${Number(x.asignee)},'${x.Sdate}','${x.Ddate}',${parseFloat(x.Edate)},${Number(x.progress)},'${fileloc}')`


    if (req.files) {
        file.mv(__dirname + `/../public/${fileloc}`, function (err) {
            if (err) console.log(err)
        })
    }

    pool.query(sql, (err) => {
        if (err) console.log(err)
        pool.query(sqLog, [Number(x.projectid), `${hari}`, `${note}`, `${author}`], (err) => {
            if (err) console.log(err)
            res.redirect(`/project_issues/${x.projectid}`)
        })
    })

});


router.get('/delete_issue/:projectid/:issueid', isLogged, function (req, res) {
    let sql = `DELETE FROM issues WHERE issue_id = $1`

    pool.query(sql, [req.params.issueid], (err) => {
        if (err) throw err
        res.redirect(`/project_issues/${req.params.projectid}?page=${req.query.page}`)
    })


})

router.get('/edit_ProjectIssues/:projectid/edit/:issueid', isLogged, function (req, res) {

    let projectid = Number(req.params.projectid)
    let issueid = Number(req.params.issueid)
    let sqlmembers = `SELECT CONCAT(first_name,' ',last_name) AS fullname,members.user_id  
  from members LEFT JOIN users ON members.user_id = users.user_id  
  WHERE members.project_id = ${projectid}`


    pool.query(`select * from issues where issue_id = ${issueid}`, (err, dataissue) => {
        pool.query(sqlmembers, (err, membersName) => {
            pool.query(`select project_name from projects where project_id = ${projectid}`, (err, data) => {

                res.render('edit_ProjectIssues', {
                    projectid: projectid,
                    projectname: data.rows[0].project_name,
                    assigner: membersName.rows,
                    dataisu: dataissue.rows[0],
                    moment: moment
                })
            })
        })
    })
})

router.post('/edit_ProjectIssues', isLogged, function (req, res) {
    let x = req.body;
    let file = req.files.filedoc
    let filename = file.name.toLowerCase().replace(/ /g, '');
    let fileloc = `file_upload/${filename}`

    let sql = `UPDATE issues SET project_id = ${Number(x.projectid)} , tracker = '${x.tracker}' , subject = '${x.subject}' , description = '${x.description}', status ='${x.status}',priority ='${x.priority}',assigner =${Number(x.asignee)}, start_date ='${x.Sdate}',due_date = '${x.Ddate}',estimated_time =${parseFloat(x.Edate)},done =${Number(x.progress)}, files = '${fileloc}' WHERE issue_id=${Number(x.issueid)}`

    if (req.files) {
        file.mv(__dirname + `/../public/${fileloc}`, function (err) {
            if (err) throw err

        })
    }

    pool.query(sql, (err) => {
        if (err) console.log(err)
        res.redirect(`/project_issues/${x.projectid}`)
    })

});


// =========  PROFILE   ============
router.get('/profile', isLogged, function (req, res) {
    res.render('profile', { user: req.session.user })
});

router.post('/profile_update/:id', isLogged, (req, res) => {
    const sql = 'UPDATE users SET first_name=$1, last_name=$2, password=$3, position=$4, type=$5 WHERE user_id = $6'
    const values = [req.body.first_name, req.body.last_name, req.body.password, req.body.position, JSON.parse(req.body.type), parseInt(req.params.id)]
    let sesUser = req.session.user
    pool.query(sql, values, (err, data) => {
        if (err) res.send(err)
        else {
            sesUser.first_name = values[0]
            sesUser.last_name = values[1]
            sesUser.password = values[2]
            sesUser.position = values[3]
            sesUser.type = values[4]
            res.redirect('/')
        }

    })
})


// =========  ADD PROJECT   ============
router.get('/addproject', isLogged, function (req, res) {
    let sql = `SELECT CONCAT(first_name, ' ',last_name) as fullname,user_id from users`

    pool.query(sql, (err, data) => {
        res.render('addproject', { data: data.rows })
    })
});

router.post('/addproject', isLogged, function (req, res) {
    let project = req.body.nameproject  //PROJECT_NAME
    let member = req.body.memberproject // USER_ID    


    pool.query(`INSERT INTO projects (project_name) VAlUES ('${project}')`, (err, el) => {    //INSERT PROJECT NYA    
        pool.query(`SELECT project_id FROM projects ORDER BY project_id DESC LIMIT 1`, (err, idproject) => {  //AMBIL ID PROJECT TERAKHIR        
            // INSERT MEMBER proid.rows[0].projectid
            for (let i = 0; i < member.length; i++) {
                let sql = `INSERT INTO members (user_id, project_id) VALUES ($1, $2)`;

                pool.query(sql, [parseInt(member[i]), idproject.rows[0].project_id], (err) => {
                    if (err) throw err
                    if (i == member.length - 1) {
                        res.redirect('/')
                    }
                })
            }

        })
    })


});
// =========  EDIT PROJECT   ============
router.get('/editproject/:id', isLogged, function (req, res) {
    let sqlA = `SELECT projects.project_id, projects.project_name,members.user_id from projects 
LEFT JOIN members ON projects.project_id = members.project_id
LEFT JOIN users ON members.user_id = users.user_id
WHERE projects.project_id = $1`


    pool.query(sqlA, [parseInt(req.params.id)], (err, nameproject) => {
        pool.query(`SELECT CONCAT(first_name, ' ',last_name) AS fullname,user_id from users`, (err, usersproject) => {
            let idMembers = nameproject.rows.map(snap => {
                return snap.user_id
            })
            res.render('editProject',
                {
                    id: req.params.id,
                    projectname: nameproject.rows[0].project_name,
                    usersname: usersproject.rows,
                    idMembers
                })
        })
    })

});

router.post('/editproject/:id', isLogged, function (req, res) {
    let id = parseInt(req.params.id);
    let nameProject = req.body.nameproject;
    let member = req.body.memberproject//USER ID MEMBER 
    let sqlA = `UPDATE projects SET project_name = $1 WHERE project_id = $2`
    let sqlB = `DELETE FROM members WHERE project_id = ${id}`

    pool.query(sqlA, [nameProject, id], err => {           //UPDATE PROJECT NAME NYA
        if (err) throw err
        pool.query(sqlB, (err) => {                         //DELETE MEMBER NYA YG PUNYA PROJECTID

            if (member != undefined) {
                for (let i = 0; i < member.length; i++) {     //INSERT YANG BARU KE MEMBER : USERID,PROJECTID SEBANYAK MEMBERNYA        
                    pool.query(`INSERT INTO members(user_id,project_id) VALUES(${member[i]},${id})`, err => {
                        if (i == member.length - 1) {
                            res.redirect('/')
                        }
                    })
                }
            } else {
                res.redirect('/')
            }


        })
    })

})

// =========  DELETE PROJECT   ============

router.get('/delete/:id', isLogged, (req, res) => {
    let sqlpro = `DELETE FROM projects WHERE project_id = $1`
    let sqlmem = `DELETE FROM members WHERE project_id = $1` // DELETE ANAKNYA DULU
    let role = req.session.user.role
    if (role) {
        pool.query(sqlmem, [parseInt(req.params.id)], (err) => {
            if (err) throw err
            pool.query(sqlpro, [parseInt(req.params.id)], (err) => {
                if (err) throw err
                res.redirect('/')
            })
        })
    }
})


// ========= ==================  LOGIN   ============================

router.get('/login', function (req, res, next) {

    res.render('login', { loginMessage: req.flash('loginMessage') });
});

router.post('/login', function (req, res) {
    let sql = 'SELECT * FROM users'

    pool.query(sql, (err, data) => {
        if (data == undefined || data.rows.length == 0) {
            req.flash('loginMessage', 'Email atau Password yang betul boss..');
            res.redirect("login");
        } else {
            req.session.user = data.rows[0]
            res.redirect("/");
        }

    })
});

// ===============================
router.get('/logout', function (req, res) {
    req.session.destroy(function (err) {
        res.redirect("/login");
    })
});


router.get('/api', function (req, res) {
    res.json({
        data: req.query
    })

});



// ========= ==================  PROJECT OVERVIEW   ============================
router.get('/project_overview/:id', isLogged, function (req, res) {
    let projectid = Number(req.params.id);

    let bugTotal = 0        //SQL  A
    let bugOpen = 0         //SQL  B

    let featureTotal = 0     //SQL  C
    let featureOpen = 0      //SQL  D

    let supportTotal = 0    //SQL  E
    let supportOpen = 0     //SQL  F

    let sqlA = `SELECT COUNT(*) FROM issues WHERE tracker ilike 'bug' AND project_id = ${projectid}`
    let sqlB = `SELECT COUNT(*) FROM issues WHERE tracker ilike 'bug' AND (issues.status ilike 'New' OR issues.status ilike 'In Progress' OR issues.status ilike 'Feedback') AND project_id = ${projectid}`

    let sqlC = `SELECT COUNT(*) FROM issues WHERE tracker ilike 'feature' AND project_id = ${projectid}`
    let sqlD = `SELECT COUNT(*) FROM issues WHERE tracker ilike 'feature' AND (issues.status ilike 'New' OR issues.status ilike 'In Progress' OR issues.status ilike 'Feedback') AND project_id = ${projectid}`

    let sqlE = `SELECT COUNT(*) FROM issues WHERE tracker ilike 'support' AND project_id = ${projectid}`
    let sqlF = `SELECT COUNT(*) FROM issues WHERE tracker ilike 'support' AND (issues.status ilike 'New' OR issues.status ilike 'In Progress' OR issues.status ilike 'Feedback') AND project_id = ${projectid}`

    let sqlMembers = `SELECT CONCAT(first_name,' ',last_name) AS fullname FROM users WHERE user_id IN (SELECT user_id FROM members WHERE project_id = ${projectid})`

    pool.query(sqlA, (err, totalA) => {
        bugTotal = totalA.rows[0].count
        pool.query(sqlB, (err, totalB) => {
            bugOpen = totalB.rows[0].count

            pool.query(sqlC, (err, totalC) => {
                featureTotal = totalC.rows[0].count
                pool.query(sqlD, (err, totalD) => {
                    featureOpen = totalD.rows[0].count

                    pool.query(sqlE, (err, totalE) => {
                        supportTotal = totalE.rows[0].count
                        pool.query(sqlF, (err, totalF) => {
                            supportOpen = totalF.rows[0].count
                            pool.query(sqlMembers, (err, members) => {
                                res.render('project_overview', { members: members.rows, projectid, bugTotal, bugOpen, featureTotal, featureOpen, supportTotal, supportOpen })
                            })
                        })
                    })

                })
            })
        })

    })



});

// ========= ==================  PROJECT ACTIVITY   ============================
router.get('/project_activity/:id', isLogged, function (req, res) {
    let projectid = Number(req.params.id)
    let sql = `SELECT * FROM activities where project_id = ${projectid}`
    pool.query(sql, (err, data) => {
        res.render('project_activities', { projectid, data: data.rows, moment })
    })

})

module.exports = router;