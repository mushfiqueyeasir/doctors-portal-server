const express = require('express');
const cors = require('cors');
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const verify = require('jsonwebtoken/verify');
const { request } = require('express');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());
const secret = process.env.STRIPE_SECRET_KEY;
const stripe = require('stripe')(secret);


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zpk9m.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;


const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access!' })
        }
        req.decoded = decoded;
        next();
    })
}
var emailSenderOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}
var emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions));



//SEND  appointement Email
function sendAppointmentEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;

    var email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `Appointment For ${treatment}`,
        text: `Your Appointment for ${treatment} is on ${date} at ${slot} is confirmed.`,
        html: `<div>
        <h1>Hello  ${patientName}</h1>
        <h3>Your Appointment For ${treatment} is confirmed.</h3>
        <p>Looking Forward to seeing you on ${date} at  ${slot}.</p>
        <h3>Our  Address</h3>
        <p>Aftabnagar, Ansarcamp, Panirpump er goli</p>
        <a target="_blank" href="doctors.portal.113.netlify.app">Visit  Us</a>
        </div>`
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });

}

//SEND  Payment Email
function sendAppointmentEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking;

    var email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `Payment For ${treatment}`,
        text: `Your payment for this Appointment ${treatment} is on ${date} at ${slot} is Received.`,
        html: `<div>
        <h1>Hello  ${patientName}</h1>
        <h3>Your Appointment For ${treatment} is confirmed.</h3>
        <p>We have received your payment for ${treatment} which is on  ${date} at  ${slot}.</p>
        <h3>Our  Address</h3>
        <p>Aftabnagar, Ansarcamp, Panirpump er goli</p>
        <a target="_blank" href="doctors.portal.113.netlify.app">Visit  Us</a>
        </div>`
    };

    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    });

}





async function run() {

    try {
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('booking');
        const usersCollection = client.db('doctors_portal').collection('users');
        const doctorsCollection = client.db('doctors_portal').collection('doctors');
        const paymentsCollection = client.db('doctors_portal').collection('payments');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requestAccount = await usersCollection.findOne({ email: requester });

            if (requestAccount.role === 'admin') {
                {
                    next();
                }
            } else {
                res.status(403).send({ message: 'Forbidden Access' });
            }
        }



        //Get all Services
        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 20, 2022';
            const services = await servicesCollection.find().toArray();
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            services.forEach(service => {
                const serviceBookings = bookings.filter(b => b.treatment === service.name);
                const booked = serviceBookings.map(s => s.slot);
                const available = service.slots.filter(s => !booked.includes(s));
                service.slots
                    = available;
            })
            res.send(services);
        })




        //Add Booking 
        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, patient: booking.patient, date: booking.date }
            const exist = await bookingCollection.findOne(query);

            if (exist) {
                return res.send({ success: false, booking: exist })
            } else {
                const result = await bookingCollection.insertOne(booking);
                sendAppointmentEmail(booking);
                return res.send({ success: true, result });
            }
        })

        //Get   specific booking
        app.get('/booking/:id', verify, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking)
        })

        //Get booking
        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;

            if (patient === decodedEmail) {
                const query = { patient: patient };
                const booking = await bookingCollection.find(query).toArray();
                res.send(booking);
            } else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        })


        //Add Users
        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
        })

        //Get Users
        app.get('/users', async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        })


        //Make user Admin
        app.put('/users/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);
        })


        //GET specific Admin
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        //Delete User
        app.delete('/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            console.log(filter);
            const result = await usersCollection.deleteOne(filter)
            res.send(result);
        })


        //Add Doctor
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        })

        //Get Doctor
        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorsCollection.find().toArray();
            res.send(doctors);
        })

        //Delete Doctor
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const result = await doctorsCollection.deleteOne(filter)
            res.send(result);
        })


        //ADD paymentIntent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;


            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card'],
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            });
        });

        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) }
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId,
                }
            }

            const updatedBooking = await bookingCollection.updateOne(filter, updateDoc);
            const result = await paymentsCollection.insertOne(payment);
            res.send(updateDoc);
        })






    }
    finally {

    }


}

run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello from Doctor uncle')
})

app.listen(port, () => {
    console.log(`Doctor app is running on port ${port}`);
})