const express = require('express');
const app = express();
const port = 8000;
const db = require('./config/db');
const route = require('./route/site');

app.use(express.json());
db.connect();
route(app);
// require('./app/controllers/CronJob')
app.get('/',(req, res) => res.send("Hello world"));
app.listen(port, () => console.log(`App listening at http://localhost:${port}`));   