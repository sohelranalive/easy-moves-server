const express = require('express');
const cors = require('cors');
const app = express()
require('dotenv').config()
const port = process.env.PORT || 5000

//middleware
app.use(cors())
app.use(express.json())


//mongodb connection setup
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3krokas.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        const userCollection = client.db('easyMoves').collection('user');

        //Save all user into DB (including normal user,instructor & admin)
        app.post('/user', async (req, res) => {
            const userInfo = req.body;
            const result = await userCollection.insertOne(userInfo)
            res.send(result)
        })
        //return user based on condition
        app.get('/user', async (req, res) => {
            if (req.query?.email) {
                const email = req.query.email;
                const filter = { email: email }
                const findUser = await userCollection.findOne(filter)
                if (findUser) {
                    return res.send({ userExist: true })
                }
                else {
                    return res.send({ userExist: false })
                }
            }
            const allUser = await userCollection.find().toArray()
            res.send(allUser)
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Welcome to Easy Moves Server')
})

app.listen(port, () => {
    console.log(`EasyMoves server is running on port: ${port}`);
})