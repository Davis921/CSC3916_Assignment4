var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect(process.env.DB);

// Movie schema
const MovieSchema = new mongoose.Schema({
    title: { type: String, required: true, index: true },
    releaseDate: { 
      type: Number, 
      min: [1900, 'Must be greater than 1899'], 
      max: [2100, 'Must be less than 2100'] 
    },
    imageUrl: String,
    genre: {
      type: String,
      enum: ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Thriller', 'Western', 'Science Fiction'],
      required: true
    },
    actors: [{
      actorName: { type: String, required: true },
      characterName: { type: String, required: true },
    }],
}, { timestamps: true });

// return the model
module.exports = mongoose.model('Movie', MovieSchema);