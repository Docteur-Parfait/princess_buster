# Firebase : connexion Google, progression et classement général

Quand Firebase est configuré, le jeu utilise **Firebase Authentication (Google)** et **Cloud Firestore** :

- le joueur se connecte avec son compte Google (ou choisit « Jouer sans compte ») ;
- sa progression (niveaux réussis, meilleurs scores, tentatives) est sauvegardée dans le cloud et retrouvée sur tous ses appareils ;
- le **classement général** (top 50) réunit tous les joueurs connectés, ton rang est surligné.

Sans configuration (`public/js/firebase-config.js` = `null`), rien ne change : sauvegarde locale ou SQLite.

## 1. Créer le projet Firebase

1. <https://console.firebase.google.com> → **Ajouter un projet** (Google Analytics non nécessaire).
2. **Créer → Authentication → Commencer → Méthode de connexion → Google → Activer** (choisis l'e-mail d'assistance).
3. **Authentication → Paramètres → Domaines autorisés** : ajoute `princess-buster.vercel.app` (et ton domaine perso s'il y en a un). `localhost` est déjà autorisé pour les tests.
4. **Créer → Firestore Database → Créer une base** (mode production, région proche de tes joueurs, par exemple `eur3`).
5. **Firestore → Règles** : colle le contenu de [`firestore.rules`](../firestore.rules) puis **Publier**.
6. **Paramètres du projet (⚙) → Vos applications → Web (`</>`)** → enregistre l'application et copie l'objet `firebaseConfig`.

## 2. Brancher le jeu

Ouvre `public/js/firebase-config.js` et remplace `null` par ta configuration :

```js
window.PB_FIREBASE = {
  apiKey: 'AIza...',
  authDomain: 'ton-projet.firebaseapp.com',
  projectId: 'ton-projet',
  appId: '1:1234567890:web:abcdef',
};
```

Ces valeurs **ne sont pas secrètes** (elles identifient le projet côté navigateur) ; la protection des données vient des règles Firestore. Puis `git push` : Vercel redéploie.

## Données stockées

| Chemin | Contenu |
| --- | --- |
| `players/{uid}` | `name`, `totalScore`, `levelsDone`, `createdAt`, `updatedAt` |
| `players/{uid}/progress/{niveau}` | `level`, `bestScore`, `attempts`, `completed`, `updatedAt` |

`uid` est l'identifiant Firebase du compte Google. L'adresse e-mail et la photo Google ne sont **pas** copiées dans Firestore : seul le prénom (modifiable dans le profil) est public dans le classement.

Le score d'un niveau gagné vaut **20 points + 1 point par balle restante** ; le total du joueur est la somme de ses meilleurs scores par niveau. À la première connexion, la progression déjà jouée sur l'appareil est reprise et ajoutée au compte.

## Index et quotas

- Le classement est une requête `players` triée par `totalScore` décroissant (limite 50) : l'index automatique suffit.
- Le plan gratuit (Spark) permet 50 000 lectures et 20 000 écritures par jour. Chaque ouverture du classement coûte 50 lectures.

## Limites connues (anti-triche)

Le score est calculé dans le navigateur. Les règles empêchent déjà de modifier les données d'un autre joueur, de baisser un score, ou d'ajouter plus de 220 points par écriture, mais un joueur déterminé peut quand même envoyer de faux résultats. Pour un classement à l'épreuve de la triche, il faudrait valider les parties côté serveur (Cloud Functions) : possible, mais le plan Blaze (payant) est alors nécessaire.

## Application Tauri (APK / desktop)

La connexion Google par fenêtre contextuelle ne fonctionne pas dans l'application Tauri : elle garde sa base SQLite locale. La PWA (installation depuis Chrome) utilise Firebase normalement.
