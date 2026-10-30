// Configuration Firebase (connexion Google + Firestore). Voir docs/FIREBASE.md.
// Laisse `null` pour désactiver : le jeu utilise alors la sauvegarde locale (navigateur / SQLite).
// Ces valeurs ne sont pas secrètes (elles identifient le projet) : la sécurité vient des règles Firestore (firestore.rules).
window.PB_FIREBASE = null;
/* Exemple :
window.PB_FIREBASE = {
  apiKey: 'AIza...',
  authDomain: 'ton-projet.firebaseapp.com',
  projectId: 'ton-projet',
  appId: '1:1234567890:web:abcdef',
};
*/
