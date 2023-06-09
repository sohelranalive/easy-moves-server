const express = require('express');
const cors = require('cors');
const app = express()
require('dotenv').config()
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000

//middleware
app.use(cors())
app.use(express.json())

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    const token = authorization.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next()
    })
}

//mongodb connection setup
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
        const classCollection = client.db('easyMoves').collection('class');

        // Level wise user (admin, user, instructor) verify
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            next()
        }

        const verifyUser = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            if (user?.role !== 'user') {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            next()
        }

        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            next()
        }



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

        //jwt verify API
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1hr' })
            res.send({ token })
        })

        //return the level on authentication
        app.get('/user/level/:email', verifyJWT, async (req, res) => {
            const userEmail = req.params.email

            if (req.decoded.email !== userEmail) {
                return res.status(401).send({ error: true, message: 'unauthorized access' })
            }

            const query = { email: userEmail }
            const user = await userCollection.findOne(query)
            const userRole = user.role;
            return res.send({ level: userRole })
        })

        //return stats of admin
        app.get('/admin/stats/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email

            if (req.decoded.email !== email) {
                return res.status(401).send({ error: true, message: 'unauthorized access' })
            }
            const userResult = await userCollection.find().toArray()
            const classResult = await classCollection.find().toArray()
            res.send({ userResult, classResult })
        })

        //return stats of user
        app.get('/user/stats/:email', verifyJWT, verifyUser, async (req, res) => {
            const email = req.params.email

            if (req.decoded.email !== email) {
                return res.status(401).send({ error: true, message: 'unauthorized access' })
            }

            const query = { email: email }
            const user = await userCollection.findOne(query)

            return res.send({ message: user.name + ' Bhai' })

        })
        //return stats & data of instructor
        app.get('/instructor/stats/:email', verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.params.email

            if (req.decoded.email !== email) {
                return res.status(401).send({ error: true, message: 'unauthorized access' })
            }

            const query = { instructorEmail: email }
            const result = await classCollection.find(query).toArray()
            res.send(result)
        })

        //add class by instructor
        app.post('/instructor/addClass', verifyJWT, verifyInstructor, async (req, res) => {
            const classData = req.body;
            const result = await classCollection.insertOne(classData)
            res.send(result)
        })

        //update class info by instructor
        app.patch('/instructor/updateClass/:id', verifyJWT, verifyInstructor, async (req, res) => {
            const id = req.params.id;
            const updateClassData = req.body;
            const filter = { _id: new ObjectId(id) };

            const updatedInfo = {
                $set: {
                    className: updateClassData.className,
                    price: updateClassData.price
                }
            };
            const result = await classCollection.updateOne(filter, updatedInfo);
            res.send(result)
        })

        //update user role by admin
        app.patch('/admin/changeRole', verifyJWT, verifyAdmin, async (req, res) => {
            const userId = req.query.userId;
            const newRole = req.query.role;

            const filter = { _id: new ObjectId(userId) }

            const updatedInfo = {
                $set: {
                    role: newRole
                }
            }
            const result = await userCollection.updateOne(filter, updatedInfo);
            res.send(result)
        })

        //update classes information by admin
        app.patch('/class/takeAction', verifyJWT, verifyAdmin, async (req, res) => {
            const userId = req.query.userId;
            const requiredAction = req.query.action;

            const filter = { _id: new ObjectId(userId) }

            const updatedInfo = {
                $set: {
                    status: requiredAction
                }
            }
            const result = await classCollection.updateOne(filter, updatedInfo);
            res.send(result)
        })

        //update feedback of classes by admin
        app.patch('/class/feedback/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const classFeedback = req.body;
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }

            const updatedInfo = {
                $set: {
                    feedback: classFeedback.feedback
                }
            }
            const result = await classCollection.updateOne(filter, updatedInfo);
            res.send(result)
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