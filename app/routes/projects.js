var express = require('express');
var router = express.Router();
var helpers = require('../helpers/util');
var path = require('path');
const moment = require('moment')

module.exports = function (pool) {

    router.get('/', helpers.loggedIn, function (req, res, next) {
        const url = req.query.page ? req.url : '/?page=1';
        const page = req.query.page || 1;
        const limit = 5;
        const offset = (page - 1) * limit
        let searching = false;
        let params = [];
        let status = req.session.status;

        if (req.query.checkid && req.query.formid) {
            params.push(`projects.projectid = ${req.query.formid}`);
            searching = true;
        }

        if (req.query.checkname && req.query.formname) {
            params.push(`projects.projectname ilike '%${req.query.formname}%'`);
            searching = true;
        }

        if (req.query.checkmember && req.query.member) {
            params.push(`CONCAT(users.firstname,' ',users.lastname) = '${req.query.member}'`);
            searching = true;
        }

        // untuk menghitung jumlah data
        let sql = `select count(id) as total from (select distinct projects.projectid as id from projects
                LEFT JOIN members ON projects.projectid = members.projectid
                LEFT JOIN users ON members.userid = users.userid`

        if (searching) {
            sql += ` where ${params.join(' AND ')}`
        }

        sql += `) as project_member`;
        //console.log('count query', sql);

        pool.query(sql, (err, data) => {
            const totalPages = data.rows[0].total;
            const pages = Math.ceil(totalPages / limit)

            //untuk menampilkan data dari project
            sql = `select distinct projects.projectid, projects.projectname from projects
                LEFT JOIN members ON projects.projectid = members.projectid
                LEFT JOIN users ON members.userid = users.userid`

            if (searching) {
                sql += ` where ${params.join(' AND ')}`
            }

            sql += ` ORDER BY projects.projectid LIMIT ${limit} OFFSET ${offset}`

            // untuk membatasi query members berdasarkan project yang akan diolah saja
            let subquery = `select distinct projects.projectid from projects LEFT JOIN members ON projects.projectid = members.projectid
            LEFT JOIN users ON members.userid = users.userid`
            if (searching) {
                subquery += ` where ${params.join(' AND ')}`
            }

            subquery += ` ORDER BY projectid LIMIT ${limit} OFFSET ${offset}`
            //console.log("project list", subquery);

            // mendapatkan data member berdasarkan project
            let sqlMembers = `SELECT projects.projectid, CONCAT (users.firstname,' ',users.lastname) AS fullname
                    FROM members
                    INNER JOIN projects ON members.projectid = projects.projectid
                    INNER JOIN users ON users.userid = members.userid 
                    WHERE projects.projectid IN
                (${subquery})`;
            //console.log("load members", sqlMembers);
            pool.query(sql, (err, projectData) => {
                pool.query(sqlMembers, (err, memberData) => {
                    projectData.rows.map(project => {
                        project.members = memberData.rows.filter(member => {
                            return member.projectid == project.projectid
                        }).map(item => item.fullname)
                    })
                    //console.log("data jadi", projectData.rows);
                    // ambil semua data dari users untuk select filter member
                    pool.query(`select CONCAT(firstname,' ',lastname) AS fullname from users`, (err, usersData) => {
                        // opsi checkbox untuk menampilkan colom di table
                        pool.query(`SELECT option -> 'option1' AS o1, option -> 'option2' AS o2, option -> 'option3' AS o3 FROM users where userid=${req.session.user}`, (err, data) => {

                            let columnOne = data.rows[0].o1;
                            let columnTwo = data.rows[0].o2;
                            let columnThree = data.rows[0].o3;

                            res.render('projects/list', {
                                data: projectData.rows,
                                users: usersData.rows,
                                pagination: {
                                    pages,
                                    page,
                                    totalPages,
                                    url
                                },
                                query: req.query,
                                columnOne,
                                columnTwo,
                                columnThree,
                                status
                            })
                        })
                    })
                })
            })
        })
    });

    // ================================ OPTION CHECKLIST ================================ //

    router.post('/option', (req, res, next) => {
        let option1 = false;
        let option2 = false;
        let option3 = false;

        if (req.body.cid) {
            option1 = true;
        }
        if (req.body.cname) {
            option2 = true;
        }
        if (req.body.cmember) {
            option3 = true;
        }
        let sql = `UPDATE users SET option = option::jsonb || '{"option1" : ${option1}, "option2" : ${option2}, "option3" : ${option3}}' WHERE userid = ${req.session.user}`
        //console.log(sql);

        pool.query(sql, (err) => {
            if (err) {
                console.log(err);
            }
            res.redirect('/projects')
        })
    })

    // ================================ ADD Project ================================ //

    router.get('/add', function (req, res, next) {
        pool.query('select * from users ORDER BY userid', (err, data) => {
            if (err) return res.send(err)
            res.render('projects/add', { 
                users: data.rows 
            });
        })
    });

    router.post('/add', function (req, res, next) {
        //console.log(req.body);
        pool.query(`insert into projects (projectname) values ('${req.body.projectName}')`, (err) => {
            if (err) return res.send(err)
            if (req.body.users) {
                // select projectid from projects order by projectid desc limit 1

                pool.query(`select max(projectid) from projects`, (err, latestId) => {
                    if (err) return res.send(err)
                    let projectId = latestId.rows[0].max;
                    if (Array.isArray(req.body.users)) {
                        let values = [];
                        req.body.users.forEach((item) => {
                            values.push(`(${projectId}, ${item.split("#")[0]}, '${item.split("#")[1]}')`);
                        })
                        let sqlMembers = `insert into members (projectid, userid, role) values `
                        sqlMembers += values.join(', ')
                        console.log("query buat masukin members", sqlMembers);
                        pool.query(sqlMembers, (err) => {
                            if (err) return res.send(err)
                            res.redirect('/projects');
                        });
                    } else {
                        pool.query(`insert into members (projectid, userid, role) values (${projectId}, ${req.body.users.split("#")[0]}, '${req.body.users.split("#")[1]}')`, (err) => {
                            if (err) return res.send(err)
                            res.redirect('/projects');
                        });
                    }
                })

            } else {
                res.redirect('/projects');
            }
        });
    });

    //  ================================ EDIT ================================ //

    router.get('/edit/:projectid', function (req, res, next) {
        let projectid = req.params.projectid;
        pool.query(`SELECT * FROM projects where projectid = ${projectid}`, (err, projectData) => {
            if (err) return res.send(err)
            pool.query(`SELECT userid FROM members where projectid = ${projectid}`, (err, memberData) => {
                if (err) return res.send(err)
                pool.query('select userid, firstname, lastname, position from users ORDER BY userid', (err, userData) => {
                    if (err) return res.send(err)
                    res.render('projects/edit', {
                        project: projectData.rows[0],
                        members: memberData.rows.map(item => item.userid), //[1,3,5]
                        users: userData.rows
                    })
                })
            })
        });
    });

    router.post('/edit/:id', (req, res, next) => {

        let id = req.params.id;

        pool.query(`DELETE FROM members where projectid =${id}`, (err) => {
            if (err) return res.send(err)
            if (req.body.users) {
                if (Array.isArray(req.body.users)) {
                    let values = [];
                    req.body.users.forEach((item) => {
                        values.push(`(${id}, ${item.split("#")[0]}, '${item.split("#")[1]}')`);
                    })
                    let sqlMembers = `insert into members (projectid, userid, role) values `
                    sqlMembers += values.join(', ')
                    //console.log("query buat masukin members", sqlMembers);
                    pool.query(sqlMembers, (err) => {
                        if (err) return res.send(err)
                        res.redirect('/projects');
                    });
                } else {
                    pool.query(`insert into members (projectid, userid, role) values (${id}, ${req.body.users.split("#")[0]}, '${req.body.users.split("#")[1]}')`, (err) => {
                        if (err) return res.send(err)
                        res.redirect('/projects');
                    });
                }
            } else {
                res.redirect('/projects');
            }
        })

    })

    // ================================ DELETE ================================ //
    router.get('/delete/:id', function (req, res, next) {
        let id = req.params.id;
        pool.query(`DELETE FROM members where projectid = ${id}`, (err) => {
            if (err) return res.send(err)
            pool.query(`DELETE FROM projects where projectid = ${id}`, (err) => {
                if (err) return res.send(err)
                //console.log(`data berhasil di delete`);
                res.redirect('/projects');
            });
        });
    });

    // ================================ OVERVIEW ================================ //
    router.get('/overview/:projectid', function (req, res, next) {
        let projectid = req.params.projectid;

        let bugTotal = 0;
        let bugOpen = 0;

        let featureTotal = 0;
        let featureOpen = 0;

        let supportTotal = 0;
        let supportOpen = 0;

        let sqlMembers = `SELECT CONCAT (firstname, ' ', lastname) AS "fullname" FROM users where userid IN (SELECT userid FROM members WHERE projectid = ${projectid})`

        pool.query(`SELECT count(*) from issues where tracker ilike 'bug' and projectid = ${projectid}`, (err, dataBugTotal) => {
            bugTotal = dataBugTotal.rows[0].count
            pool.query(`SELECT count(*) from issues where tracker ilike 'bug' and (issues.status ilike 'New' OR issues.status ilike 'In Progress' OR issues.status ilike 'Feedback') and projectid = ${projectid}`, (err, dataBugOpen) => {
                bugOpen = dataBugOpen.rows[0].count
                pool.query(`SELECT count(*) from issues where tracker ilike 'feature' and projectid = ${projectid}`, (err, dataFeatureTotal) => {
                    featureTotal = dataFeatureTotal.rows[0].count
                    pool.query(`SELECT COUNT(*) from issues where tracker ilike 'feature' and (issues.status ilike 'New' OR issues.status ilike 'In Progress' OR issues.status ilike 'Feedback') AND projectid = ${projectid}`, (err, dataFeatureOpen) => {
                        featureOpen = dataFeatureOpen.rows[0].count
                        pool.query(`SELECT COUNT(*) FROM issues where tracker ilike 'support' and projectid = ${projectid}`, (err, dataSupportTotal) => {
                            supportTotal = dataSupportTotal.rows[0].count
                            pool.query(`SELECT COUNT(*) FROM issues WHERE tracker ilike 'support' AND (issues.status ilike 'New' OR issues.status ilike 'In Progress' OR issues.status ilike 'Feedback') AND projectid = ${projectid}`, (err, dataSupportOpen) => {
                                supportOpen = dataSupportOpen.rows[0].count
                                pool.query(sqlMembers, (err, members) => {
                                    pool.query(`SELECT * FROM projects where projectid = ${projectid}`, (err, projectData) => {
                                        console.log('wahahahahhahahah', dataBugTotal);

                                        if (err) return res.send(err)
                                        res.render('projects/overview/view', {
                                            projectid,
                                            identity: 'overview',
                                            members: members.rows,
                                            project: projectData.rows[0],
                                            bugTotal,
                                            bugOpen,
                                            featureTotal,
                                            featureOpen,
                                            supportTotal,
                                            supportOpen
                                        })
                                    })
                                })
                            })
                        })
                    })
                })
            })
        })




    })

    // ================================ ACTIVITY ================================ //

    router.get('/activity/:projectid', function (req, res, next) {

        let projectid = req.params.projectid;
        const today = new Date();
        const sevenDaysBefore = new Date(today.getTime() - (6 * 24 * 60 * 60 * 1000));

        const sql = `select activity.*, concat(firstname,' ', lastname) as fullname
        from activity left join users on activity.author = users.userid
        where time
        between '${moment(sevenDaysBefore).format('YYYY-MM-DD')}'
        and '${moment(today).add(1, 'days').format('YYYY-MM-DD')}'
        order by time desc`;

        console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaa',sql);
        

        pool.query(sql, (err, data) => {

            let result = {};

            data.rows.forEach((item) => {
                if (result[moment(item.time).format('dddd')] && result[moment(item.time).format('dddd')].data) {
                    result[moment(item.time).format('dddd')].data.push(item);
                } else {
                    result[moment(item.time).format('dddd')] = { date: moment(item.time).format('YYYY-MM-DD'), data: [item] };
                }
            })
            // console.log('aaaaaaaaaaaaaaaaaaaaa', data);
            res.render('projects/activity/view', {
                projectid,
                identity: 'activity',
                data: data.rows,
                data: result,
                today,
                sevenDaysBefore,
                moment
            })
            //console.log('bbbbbbbbbbbbbb', JSON.stringify(result));
        })
    })


    // ================================ PROJECT DETAIL MEMBER ================================ //
    router.get('/members/:projectid', helpers.loggedIn, function (req, res, next) {
        let projectid = req.params.projectid;
        const url = req.query.page ? req.url : `/members/${projectid}/?page=1`;
        const page = req.query.page || 1;
        const limit = 4;
        const offset = (page - 1) * limit
        let searching = false;
        let params = [];

        if (req.query.checkid && req.query.filterid) {
            params.push(`members.id = ${req.query.filterid}`);
            searching = true;
        }

        if (req.query.checkname && req.query.filtername) {
            params.push(`users.firstname ilike '%${req.query.filtername}%'`);
            searching = true;
        }

        if (req.query.checkposition && req.query.filterposition) {
            params.push(`members.role ilike '%${req.query.filterposition}%'`);
            searching = true;
        }

        // untuk menghitung jumlah data yang muncul di table
        let sql = `SELECT COUNT (members.id) AS total
        FROM members
        INNER JOIN projects ON members.projectid = projects.projectid
        INNER JOIN users ON members.userid = users.userid
        WHERE projects.projectid = ${projectid}`

        if (searching) {
            sql += ` AND ${params.join(' AND ')}`
        }

        pool.query(sql, (err, data) => {

            const totalPages = data.rows[0].total;
            const pages = Math.ceil(totalPages / limit)

            // mendapatkan data member berdasarkan project
            let sqlMembers = `SELECT members.id, members.role, users.firstname, users.userid
            FROM members
            INNER JOIN projects ON members.projectid = projects.projectid
            INNER JOIN users ON members.userid = users.userid
            WHERE projects.projectid = ${projectid}`;

            if (searching) {
                sqlMembers += ` AND ${params.join(' AND ')}`
            }

            sqlMembers += ` LIMIT ${limit} OFFSET ${offset}`

            pool.query(sqlMembers, (err, memberData) => {

                pool.query(`SELECT optiondetail -> 'option1' AS o1, optiondetail -> 'option2' AS o2, optiondetail -> 'option3' AS o3 FROM users where userid = ${req.session.user}`, (err, opsi) => {

                    let columnOne = opsi.rows[0].o1;
                    let columnTwo = opsi.rows[0].o2;
                    let columnThree = opsi.rows[0].o3;
                    //console.log(columnOne, columnTwo, columnThree);
                    //console.log(memberData.rows);
                    console.log(opsi);


                    res.render('projects/members/list', {
                        projectid,
                        identity: 'members',
                        data: memberData.rows,
                        //users: usersData.rows,
                        pagination: {
                            pages,
                            page,
                            totalPages,
                            url
                        },
                        query: req.query,
                        columnOne,
                        columnTwo,
                        columnThree,
                        projectid
                    })
                })
            })

        })
    })

    router.post('/members/:projectid/option', (req, res) => {

        let option1 = false;
        let option2 = false;
        let option3 = false;

        if (req.body.checkid) {
            option1 = true;
        }
        if (req.body.checkname) {
            option2 = true;
        }
        if (req.body.checkmember) {
            option3 = true;
        }
        let sql = `UPDATE users SET optiondetail = optiondetail::jsonb || '{"option1" : ${option1}, "option2" : ${option2}, "option3" : ${option3}}' WHERE userid = ${req.session.user}`

        pool.query(sql, (err) => {
            if (err) {
                console.log(err);
            }
            res.redirect(`/projects/members/${req.params.projectid}`)
        })
    })

    //  ================================ Members ADD ================================ //
    router.get('/members/:projectid/add/', function (req, res, next) {
        let projectid = req.params.projectid;
        let sql = `SELECT userid,CONCAT(firstname,' ',lastname) as fullname from users WHERE userid NOT IN (SELECT userid from members where projectid =${projectid})`

        pool.query(sql, (err, data) => {
            console.log(data);
            res.render('projects/members/add', {
                projectid,
                identity: 'members',
                data: data.rows,
                projectid,
                position: helpers.positionEnum
            })
        })
    })

    router.post('/members/:projectid/add/', function (req, res) {
        let member = req.body.member;
        let projectid = req.params.projectid;

        let sql = `INSERT INTO members(userid, projectid, role) VALUES (${member}, ${projectid}, '${req.body.position}')`
        pool.query(sql, (err) => {
            console.log('wkwkwkwkwkwkwk', sql);

            if (err) console.log(err)
            res.redirect(`/projects/members/${projectid}`)
        })
    })

    //  ================================ MEMBER EDIT ================================ //

    router.get('/members/:projectid/edit/:id', function (req, res, next) {
        let projectid = req.params.projectid;
        let id = req.params.id;

        pool.query(`SELECT members.*, CONCAT(users.firstname,' ',users.lastname) as fullname from members left join users on members.userid = users.userid where id = ${id} ORDER BY id`, (err, memberData) => {
            if (err) return res.send(err)
            res.render('projects/members/edit', {
                projectid,
                identity: 'members',
                position: helpers.positionEnum,
                member: memberData.rows[0],
                projectid
            })
        })
    })

    router.post('/members/:projectid/edit/:id', (req, res, next) => {

        //let projectname = req.body.projectName;
        //let projectid = req.params.projectid;
        let id = req.params.id;

        pool.query(`UPDATE members SET role = '${req.body.position}' WHERE id = ${id}`, (err) => {
            if (err) res.send(err)
            res.redirect(`/projects/members/${req.params.projectid}`)
        })
    })

    // ================================ DELETE ================================ //
    router.get('/members/:projectid/delete/:id', function (req, res, next) {
        // let id = req.params.id;
        let projectid = req.params.projectid;
        pool.query(`DELETE FROM members where projectid = ${projectid} and id = ${req.params.id}`, (err) => {
            if (err) return res.send(err)
            res.redirect(`/projects/members/${projectid}`);
        });
    });

    // ================================ ISSUES ================================ //

    router.get('/issues/:projectid', helpers.loggedIn, function (req, res, next) {
        let projectid = req.params.projectid;
        let params = [];
        let searching = false;

        if (req.query.checkid && req.query.formid) {
            params.push(`issues.issuesid = ${req.query.formid}`);
            searching = true;
        }

        if (req.query.checksubject && req.query.formsubject) {
            params.push(`issues.subject ilike '%${req.query.formsubject}%'`);
            searching = true;
        }

        if (req.query.checktracker && req.query.tracker) {
            params.push(`issues.tracker = '${req.query.tracker}'`);
            searching = true;
        }

        //hitung data issues yang muncul di table

        let sql = `SELECT COUNT(*) AS total
        FROM issues
        WHERE projectid = ${projectid}`


        pool.query(sql, (err, count) => {

            sql = `select * from issues where projectid = ${projectid} `;

            if (searching) {
                sql += ` AND ${params.join(' AND ')}`
            }

            sql += ` order by issuesid`;

            pool.query(sql, (err, dataIssues) => {
                pool.query(`SELECT optionissues -> 'option1' AS o1, optionissues -> 'option2' AS o2, optionissues -> 'option3' AS o3 FROM users where userid = ${req.session.user}`, (err, opsi) => {

                    let columnOne = opsi.rows[0].o1;
                    let columnTwo = opsi.rows[0].o2;
                    let columnThree = opsi.rows[0].o3;

                    res.render('projects/issues/list', {
                        query: req.query,
                        data: dataIssues.rows,
                        projectid,
                        identity: 'issues',
                        columnOne,
                        columnTwo,
                        columnThree
                    })
                })
            })
        })


    })

    router.post('/issues/:projectid/option', (req, res, next) => {

        let option1 = false;
        let option2 = false;
        let option3 = false;

        if (req.body.checkid) {
            option1 = true;
        }
        if (req.body.checksubject) {
            option2 = true;
        }
        if (req.body.checktracker) {
            option3 = true;
        }
        let sql = `UPDATE users SET optionissues = option::jsonb || '{"option1" : ${option1}, "option2" : ${option2}, "option3" : ${option3}}' WHERE userid = ${req.session.user}`

        console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaaa', sql);


        pool.query(sql, (err) => {
            if (err) {
                console.log(err);
            }
            res.redirect(`/projects/issues/${req.params.projectid}`)
        })
    })

    // ================================ ADD ISSUES ================================ //

    router.get('/issues/:projectid/add', function (req, res, next) {

        let projectid = req.params.projectid;
        let sql = `SELECT CONCAT(firstname,' ',lastname) AS fullname, members.userid 
        FROM members LEFT JOIN users ON members.userid = users.userid WHERE members.projectid = ${projectid}`

        pool.query(sql, (err, membersName) => {


            pool.query(`SELECT projectname from projects where projectid = ${projectid}`, (err, projectName) => {
                console.log('members', membersName);
                console.log('project', projectName);
                res.render('projects/issues/add', {
                    membersName: membersName.rows,
                    projectName: projectName.rows[0].projectname,
                    projectid,
                    identity: 'issues'
                })
            })
        })
    })

    router.post('/issues/:projectid/add', function (req, res, next) {
        let projectid = req.params.projectid;
        let file = req.files.filedoc
        let filename = file.name.toLowerCase().replace('', Date.now());

        let sql = `INSERT INTO issues (projectid, tracker, subject, description, status, priority, assignee, startdate, duedate, estimatedtime, done, files, createddate) VALUES (${req.params.projectid}, '${req.body.tracker}', '${req.body.subject}', '${req.body.description}', '${req.body.status}', '${req.body.priority}', ${req.body.assignee}, '${req.body.startdate}', '${req.body.duedate}', '${req.body.estimatedtime}', ${req.body.progress}, '${filename}', current_timestamp)`

        if (req.files) {
            file.mv(__dirname + `/../public/file_upload/${filename}`, function (err) {
                if (err) return res.send(err)
            })
        }

        pool.query(sql, (err) => {

            //console.log('lol', file);
            console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaa', sql);
            if (err) return res.send(err)
            res.redirect(`/projects/issues/${projectid}`)
        })
    })

    // ================================ ISSUES DELETE ================================ //

    router.get('/issues/:projectid/delete/:issuesid', function (req, res, next) {
        let issuesid = req.params.issuesid;
        let projectid = req.params.projectid;
        pool.query(`DELETE FROM issues where projectid = ${projectid} and issuesid = ${issuesid}`, (err) => {
            if (err) return res.send(err)
            res.redirect(`/projects/issues/${projectid}`);
        });
    });

    //  =============================== ISSUES EDIT ================================ //

    router.get('/issues/:projectid/edit/:issuesid', function (req, res, next) {

        let projectid = req.params.projectid;
        let issuesid = req.params.issuesid;

        pool.query(`select projectname from projects where projectid = ${projectid}`, (err, projectName) => {
            pool.query(`select * from issues where issuesid = ${issuesid}`, (err, data) => {
                pool.query(`SELECT CONCAT(firstname,' ',lastname) as fullname, members.userid from members LEFT JOIN users on members.userid = users.userid where members.projectid = ${projectid}`, (err, membersName) => {
                    pool.query(`SELECT userid, concat(firstname,' ', lastname) as fullname from users where userid = ${req.session.user}`, (err, author) => {
                        // console.log('dataaaaaaaaaaaaaaaaaa', data.rows);
                        if (err) console.log(err);
                        console.log(author);

                        res.render('projects/issues/edit', {

                            author: author.rows[0],
                            assignee: membersName.rows,
                            moment: moment,
                            issuesdata: data.rows[0],
                            projectName: projectName.rows[0].projectname,
                            projectid,
                            identity: 'issues',
                        })
                    })

                })
            })
        })
    })

    router.post('/issues/:projectid/edit/:issuesid', function (req, res) {

        let projectid = req.params.projectid;
        let file = req.files.filedoc
        let cekfile = false;
        let author = `${req.session.user}`;

        let sqlog = `insert into activity (title, description, author, issuesid, time, status) values ('${req.body.subject}', '${req.body.description}', ${author}, ${req.params.issuesid}, current_timestamp, '${req.body.status}')`

        if (file !== undefined) {
            filename = file.name.toLowerCase().replace('', Date.now());
            cekfile = true;
        }

        let sql = `UPDATE issues SET projectid = '${req.params.projectid}', tracker = '${req.body.tracker}', subject = '${req.body.subject}', description = '${req.body.description}', status = '${req.body.status}', priority = '${req.body.priority}', assignee = ${req.body.assignee}, startdate = '${req.body.startdate}', duedate = '${req.body.duedate}', estimatedtime = '${req.body.estimatedtime}', done = ${req.body.progress}, spenttime = ${req.body.spenttime}, targetversion = '${req.body.targetversion}', author = ${author}`

        if (cekfile) {
            sql += `, files = '${filename}'`;
        }

        if (req.body.status == 'Closed') {
            sql += `, closeddate = current_timestamp`
        } else {
            sql += `, updateddate = current_timestamp`
        }

        sql += ` WHERE issuesid = ${req.params.issuesid}`

        pool.query(sql, (err) => {
            pool.query(sqlog, (err) => {
                console.log('ssssssssssssssssssssssssssssss', sqlog);

                if (err) console.log(err);
                res.redirect(`/projects/issues/${projectid}`)
            })

        })
    })
    // router.post('/issues/:projectid/edit/:issuesid', function (req, res, next) {
    //     let = projectid = req.params.projectid;
    //     res.redirect(`/projects/issues/${projectid}`)
    // })


    return router;
}