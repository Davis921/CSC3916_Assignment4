/*
CSC3916 HW4
File: Server.js (Final Fixed Version)
Description: Movie API with Reviews, Aggregation, and Proper Detail Route
*/

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const passport = require('passport');
const authController = require('./auth');
const authJwtController = require('./auth_jwt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./Users');
const Movie = require('./Movies');
const Review = require('./Reviews');
const rp = require('request-promise');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(passport.initialize());

const router = express.Router();
const GA_TRACKING_ID = process.env.GA_KEY;

function trackReviewEvent(movieTitle, genre, path) {
  const options = {
    method: 'GET',
    url: 'https://www.google-analytics.com/collect',
    qs: {
      v: '1',
      tid: GA_TRACKING_ID,
      cid: crypto.randomBytes(16).toString("hex"),
      t: 'event',
      ec: genre,
      ea: path,
      el: 'API Request for Movie Review',
      ev: 1,
      cd1: movieTitle,
      cm1: 1
    },
    headers: { 'Cache-Control': 'no-cache' }
  };
  return rp(options);
}

// Signup
router.post('/signup', function(req, res) {
  if (!req.body.username || !req.body.password) {
    res.json({ success: false, msg: 'Please include both username and password to signup.' })
  } else {
    const user = new User({
      name: req.body.name,
      username: req.body.username,
      password: req.body.password
    });

    user.save(function(err) {
      if (err) {
        if (err.code === 11000)
          return res.json({ success: false, message: 'A user with that username already exists.' });
        else
          return res.json(err);
      }
      res.json({ success: true, msg: 'Successfully created new user.' });
    });
  }
});

// Signin
router.post('/signin', function(req, res) {
  const userNew = new User({ username: req.body.username, password: req.body.password });

  User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
    if (err) return res.send(err);

    user.comparePassword(userNew.password, function(isMatch) {
      if (isMatch) {
        const token = jwt.sign({ id: user.id, username: user.username }, process.env.SECRET_KEY);
        res.json({ success: true, token: 'JWT ' + token });
      } else {
        res.status(401).send({ success: false, msg: 'Authentication failed.' });
      }
    });
  });
});

// Get all movies (optionally with reviews and average rating)
router.route('/movies')
  .get(authJwtController.isAuthenticated, async (req, res) => {
    const includeReviews = req.query.reviews === 'true';
    try {
      if (includeReviews) {
        const movies = await Movie.aggregate([
          {
            $lookup: {
              from: 'reviews',
              localField: '_id',
              foreignField: 'movieId',
              as: 'movieReviews'
            }
          },
          {
            $addFields: {
              avgRating: { $avg: '$movieReviews.rating' }
            }
          },
          { $sort: { avgRating: -1 } }
        ]);
        return res.status(200).json(movies);
      } else {
        const movies = await Movie.find();
        return res.status(200).json(movies);
      }
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

// NEW: Get one movie by ID with reviews and average rating
router.get('/movie/:id', authJwtController.isAuthenticated, async (req, res) => {
  const movieId = req.params.id;

  if (!mongoose.Types.ObjectId.isValid(movieId)) {
    return res.status(400).json({ success: false, msg: 'Invalid movie ID format.' });
  }

  try {
    const result = await Movie.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(movieId) } },
      {
        $lookup: {
          from: 'reviews',
          localField: '_id',
          foreignField: 'movieId',
          as: 'movieReviews'
        }
      },
      {
        $addFields: {
          avgRating: { $avg: '$movieReviews.rating' }
        }
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ success: false, msg: 'Movie not found.' });
    }

    res.status(200).json({ success: true, movie: result[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error retrieving movie.', error: err.message });
  }
});

// Post review with analytics
router.post('/reviews', authJwtController.isAuthenticated, async (req, res) => {
  const { movieId, review, rating } = req.body;
  if (!movieId || !review || rating == null) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }
  try {
    const movie = await Movie.findById(movieId);
    if (!movie) return res.status(404).json({ success: false, message: 'Movie not found.' });

    const newReview = new Review({ movieId, username: req.user.username, review, rating });
    await newReview.save();
    await trackReviewEvent(movie.title, movie.genre, 'post /reviews');

    res.status(201).json({ message: 'Review created!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error saving review.', error: err.message });
  }
});

// Get all reviews
router.get('/reviews', async (req, res) => {
  try {
    const reviews = await Review.find();
    res.status(200).json(reviews);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching reviews.', error: err.message });
  }
});

// Delete review
router.delete('/reviews/:id', authJwtController.isAuthenticated, async (req, res) => {
  try {
    const deleted = await Review.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Review not found.' });
    res.status(200).json({ message: 'Review deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting review.' });
  }
});

app.use('/', router);
app.listen(process.env.PORT || 8080);
module.exports = app;