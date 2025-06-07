// firebaseAdmin.js
const admin = require('firebase-admin');
const serviceAccount = require('./probandocositas-8c425-firebase-adminsdk-1bse6-86e1412a7e.json'); // descarga desde Firebase Console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'probandocositas-8c425.appspot.com', // tu bucket aquí
});

const bucket = admin.storage().bucket();

module.exports = bucket;