const express = require('express');
const cors = require('cors');
const app = express()
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
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
const req = require('express/lib/request');
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
        const selectedClassCollection = client.db('easyMoves').collection('selectedClass');
        const paymentCollections = client.db('easyMoves').collection('payments');

        // Level wise user (admin) verify
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            next()
        }

        // Level wise user (Student) verify
        const verifyUser = async (req, res, next) => {
            const email = req.decoded.email
            const query = { email: email }
            const user = await userCollection.findOne(query)
            if (user?.role !== 'user') {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            next()
        }

        // Level wise user (instructor) verify
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

        //return the level of all users
        app.get('/user/level', async (req, res) => {
            const userEmail = req.query.email
            const query = { email: userEmail }
            const user = await userCollection.findOne(query)
            const userRole = user?.role;

            res.send({ level: userRole })
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

            //return all the selected class by user
            const selectClassQuery = { selectedBy: email }
            const selectedClassResult = await selectedClassCollection.find(selectClassQuery).toArray()

            //return all the class enrolled by user after successful payment
            const enrolledClassQuery = { email: email };
            const options = {
                sort: { date: -1 }
            }
            const usersAllPayment = await paymentCollections.find(enrolledClassQuery, options).toArray();
            const classIds = usersAllPayment.flatMap(payment => payment.classesIds.map(classId => new ObjectId(classId)));
            const filter = { _id: { $in: classIds } };
            const enrolledClassResult = await classCollection.find(filter).toArray();

            res.send({ selectedClassResult, enrolledClassResult, usersAllPayment })
        })

        //delete from selected items, as per user/students request
        app.delete('/selectedClass/:id', verifyJWT, verifyUser, async (req, res) => {
            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await selectedClassCollection.deleteOne(query)
            res.send(result)
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

        //get all the instructor info
        app.get('/instructor', async (req, res) => {
            const query = { role: 'instructor' }
            const result = await userCollection.find(query).toArray()
            res.send(result)
        })

        //get all the approved class info
        app.get('/classes', async (req, res) => {
            const query = { status: 'approved' }
            const result = await classCollection.find(query).toArray()
            res.send(result)
        })

        //get all the popular class information based on enrolled students
        app.get('/classes/popular', async (req, res) => {
            const filter = { status: 'approved' }
            const options = {
                sort: { totalEnrolled: -1 },
            }
            const allClasses = await classCollection.find(filter, options).toArray()
            const popularClasses = allClasses.slice(0, 6)
            res.send(popularClasses)
        })

        //class added to cart by User
        app.post('/user/addClass', verifyJWT, verifyUser, async (req, res) => {
            const classInfo = req.body;

            //checking class already enrolled or not
            const enrolledQuery = {
                email: classInfo.selectedBy,
                classesIds: { $in: [classInfo.classId] }
            };
            const enrolledResult = await paymentCollections.findOne(enrolledQuery)
            if (enrolledResult) {
                return res.send({ isEnrolled: true })
            }

            //checking this class already selected or not
            const query = { classId: classInfo.classId, selectedBy: classInfo.selectedBy };
            const existResult = await selectedClassCollection.findOne(query)
            if (existResult) {
                return res.send({ isExists: true })
            }

            const result = await selectedClassCollection.insertOne(classInfo)
            res.send(result)
        })

        //create payment intent api
        app.post('/create-payment-intent', verifyJWT, verifyUser, async (req, res) => {
            const { price } = req.body
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        //all payment related API
        app.post('/user/payments', verifyJWT, verifyUser, async (req, res) => {

            //save payment info to db
            const paymentInfo = req.body;
            const savePaymentInfo = await paymentCollections.insertOne(paymentInfo)

            //delete from selected classes who's payment is successful
            const removeQuery = { _id: { $in: paymentInfo.selectedClassIds.map(id => new ObjectId(id)) } }
            const deletedFromSelectedClass = await selectedClassCollection.deleteMany(removeQuery)

            //decrease seats and increase enrolled count  
            const filter = { _id: { $in: paymentInfo.classesIds.map(classId => new ObjectId(classId)) } }
            const updateInfo = {
                $inc: {
                    availableSeats: -1, totalEnrolled: 1
                }
            }
            const updatedClassInfo = await classCollection.updateMany(filter, updateInfo)

            //returning all the results
            res.send({ savePaymentInfo, deletedFromSelectedClass, updatedClassInfo })
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
