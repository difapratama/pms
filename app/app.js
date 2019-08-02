var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var flash = require('connect-flash');
const fileUpload = require('express-fileupload');

// ===============================================

//            CONNECT DATABASE POSTGRES

// ===============================================

const { Pool } = require('pg')

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'pmsdb',
  password: '056311',
  port: 5432,
})

// const pool = new Pool({
//     user: 'diesmzzzmmhrkn',
//     host: 'ec2-54-235-134-25.compute-1.amazonaws.com',
//     database: 'dc2fnbb6sm5cul',
//     password: 'b526f894e5bc6d16dc98b8966c9c2266961985e5ab842c94061ca335be0ef440',
//     port: 5432,
//   })

var indexRouter = require('./routes/index')(pool);
var projectsRouter = require('./routes/projects')(pool);
var profileRouter = require('./routes/profile')(pool);
var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'superrubi'
}));

app.use(flash());
app.use(fileUpload());

app.use(function (req, res, next) {
  res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.header('Expires', '-1');
  res.header('Pragma', 'no-cache');
  next();
});

app.use('/', indexRouter);
app.use('/projects', projectsRouter);
app.use('/profile', profileRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
