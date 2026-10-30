// Configuration Firebase (connexion Google + Firestore). Voir docs/FIREBASE.md.
// Laisse `null` pour désactiver : le jeu utilise alors la sauvegarde locale (navigateur / SQLite).
// Ces valeurs ne sont pas secrètes (elles identifient le projet) : la sécurité vient des règles Firestore (firestore.rules).
window.PB_FIREBASE = {
  apiKey: 'AIzaSyBY6YslMV8rZKe0pmihWI57l3i5re7H9M0',
  authDomain: 'princess-buster.firebaseapp.com',
  projectId: 'princess-buster',
  storageBucket: 'princess-buster.firebasestorage.app',
  messagingSenderId: '987963224599',
  appId: '1:987963224599:web:349fe65312e8752aa66252',
};
