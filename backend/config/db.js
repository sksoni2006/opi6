const mongoose = require("mongoose");
const dotenv = require('dotenv');

dotenv.config();


const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB connected: ${conn.connection.host}`);
        
        // Clear any existing models to prevent compilation errors
        mongoose.models = {};
        
        return conn;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
};

module.exports = connectDB;