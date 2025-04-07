/*
CSC3916 HW4
File: Server.js
Description: Web API scaffolding for Movie API
 */

var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var authController = require('./auth');
var authJwtController = require('./auth_jwt');
var jwt = require('jsonwebtoken');
var cors = require('cors');
var User = require('./Users');
var Movie = require('./Movies');
var Review = require('./Reviews');

var app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

var router = express.Router();

function getJSONObjectForMovieRequirement(req) {
    var json = {
        headers: "No headers",
        key: process.env.UNIQUE_KEY,
        body: "No body"
    };

    if (req.body != null) {
        json.body = req.body;
    }

    if (req.headers != null) {
        json.headers = req.headers;
    }

    return json;
}

router.post('/signup', function(req, res) {
    if (!req.body.username || !req.body.password) {
        res.json({success: false, msg: 'Please include both username and password to signup.'})
    } else {
        var user = new User();
        user.name = req.body.name;
        user.username = req.body.username;
        user.password = req.body.password;

        user.save(function(err){
            if (err) {
                if (err.code == 11000)
                    return res.json({ success: false, message: 'A user with that username already exists.'});
                else
                    return res.json(err);
            }

            res.json({success: true, msg: 'Successfully created new user.'})
        });
    }
});

router.post('/signin', function (req, res) {
    var userNew = new User();
    userNew.username = req.body.username;
    userNew.password = req.body.password;

    User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) {
            res.send(err);
        }

        user.comparePassword(userNew.password, function(isMatch) {
            if (isMatch) {
                var userToken = { id: user.id, username: user.username };
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json ({success: true, token: 'JWT ' + token});
            }
            else {
                res.status(401).send({success: false, msg: 'Authentication failed.'});
            }
        })
    })
});

router.route('/movies')
  .get(authJwtController.isAuthenticated, async (req, res) => {
    try {
      const movies = await Movie.find(); // Fetch all movies
      if (movies.length === 0) {
          return res.status(404).json([]); // Return an empty array instead of an error object
      }
      res.status(200).json(movies); // Return only the array of movies
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching movies.', error: err.message });
    }
  })
  .post(authJwtController.isAuthenticated, async (req, res) => {
    if (!req.body.title || !req.body.releaseDate || !req.body.genre || !req.body.actors || req.body.actors.length < 3) {
        return res.status(400).json({ success: false, msg: 'Missing required movie fields or less than 3 actors.' });
    }

    try {
        const newMovie = new Movie(req.body);
        await newMovie.save();
        res.status(200).json({ success: true, message: 'Movie added successfully.', movie: newMovie });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error saving movie.' });
    }
});

router.route('/movies/:title')
  .get(authJwtController.isAuthenticated, async (req, res) => {
      try {
          const movie = await Movie.findOne({ title: req.params.title });
          if (!movie) return res.status(404).json({ success: false, msg: 'Movie not found.' });

          res.status(200).json({ success: true, movie });
      } catch (err) {
          res.status(500).json({ success: false, message: 'Error retrieving movie.' });
      }
  })
  .put(authJwtController.isAuthenticated, async (req, res) => {
      try {
          const updatedMovie = await Movie.findOneAndUpdate(
              { title: req.params.title },
              req.body,
              { new: true }
          );
          if (!updatedMovie) return res.status(404).json({ success: false, msg: 'Movie not found.' });

          res.status(200).json({ success: true, message: 'Movie updated successfully.', movie: updatedMovie });
      } catch (err) {
          res.status(500).json({ success: false, message: 'Error updating movie.' });
      }
  })
  .delete(authJwtController.isAuthenticated, async (req, res) => {
      try {
          const deletedMovie = await Movie.findOneAndDelete({ title: req.params.title });
          if (!deletedMovie) return res.status(404).json({ success: false, msg: 'Movie not found.' });

          res.status(200).json({ success: true, message: 'Movie deleted successfully.' });
      } catch (err) {
          res.status(500).json({ success: false, message: 'Error deleting movie.' });
      }
  });

app.use('/', router);
app.listen(process.env.PORT || 8080);
module.exports = app; // for testing only


