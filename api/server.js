import dotenv from 'dotenv';
import http from 'http';
import https from 'https';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import fs from 'fs';
import * as stytch from 'stytch';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const APP_PORT = 8080;
const STYTCH_PROJECT_ID = process.env.STYTCH_PROJECT_ID;
const STYTCH_PROJECT_SECRET = process.env.STYTCH_PROJECT_SECRET;
const STYTCH_PROJECT_ENV = process.env.STYTCH_PROJECT_ENV;
const SESSION_SECRET = process.env.SESSION_SECRET;
const SESSION_DURATION_IN_MINUTES = process.env.SESSION_DURATION_IN_MINUTES || 60*60;
const DEPLOYED = process.env.DEPLOYED;
const COMMUNITY_TIMEOUT = process.env.COMMUNITY_TIMEOUT || 60*60*1000;

const env = STYTCH_PROJECT_ENV == "live" ? stytch.envs.live: stytch.envs.test;

const client = new stytch.Client({
  project_id: STYTCH_PROJECT_ID,
  secret: STYTCH_PROJECT_SECRET,
  env: env
});

const allRecommendations = {
  "codingvibe": {
    started: Date.now(),
    startedBy: "codingvibe",
    recs: [
      {
        "id": "1234",
        "rec": "https://www.youtube.com/watch?v=q67cD8pDgqk",
        "plus1s": ["melol", "youlol"],
        "submittedBy": "melol"
      },
      {
        "id": "1235",
        "rec": "https://www.youtube.com/watch?v=g5MSf_ig_IA",
        "plus1s": [],
        "submittedBy": "melol"
      }
    ],
    filters: {
      "youtube": true
    },
    name: "codingvibescoolmunity",
  }
}

const usersInCommunities = {}

/////////////////////////// Set Up Server ///////////////////////////
const app = express();
const router = express.Router();
app.use(express.json());
app.use(session({
  saveUninitialized: false,
  resave: true,
  secret: SESSION_SECRET
}));
const whitelist = ['https://communityrecs.codingvibe.dev']
if (!DEPLOYED) {
  whitelist.push('http://localhost:8000');
}

var corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true
}

router.use('/communities', (req, res, next) => {
  if (!req.session || !req.session.token) {
    // No auth token, no recs for you
    if (req.session) {
      req.session.destroy();
    }
    res.sendStatus(401);
  } else {
    client.sessions.authenticate({session_token: req.session.token})
      .then((response) => {
        if (response.status_code === 200) {
          req.session.userId = response.session.user_id;
          next();
        } else {
          req.session.destroy();
          res.sendStatus(401);
        }
      })
      .catch(error => {
        console.log(error);
        req.session.destroy();
        res.sendStatus(401);
      });
  }
})

app.use(cors(corsOptions));
app.use(router);
let server;
if (DEPLOYED) {
  const privateKey = fs.readFileSync('/etc/letsencrypt/live/communityrecsapi.codingvibe.dev/privkey.pem');
  const certificate = fs.readFileSync('/etc/letsencrypt/live/communityrecsapi.codingvibe.dev/fullchain.pem');

  const credentials = {key: privateKey, cert: certificate};
  server = https.createServer(credentials, app);
  server.listen(443);
} else {
  server = http.createServer(app);
  server.listen(APP_PORT);
}

/////////////////////////// Set up REST ///////////////////////////
app.post('/authenticate', (req, res) => {
  const token = req.query.token;
  client.magicLinks.authenticate(token, {session_duration_minutes: SESSION_DURATION_IN_MINUTES})
    .then(response => {
      req.session.token = response.session_token;
      req.session.save(function (err) {
        if (err) {
          console.error(err);
          res.status(500).send('There was an error authenticating the user.');
        } else {
          res.sendStatus(204);
        }
      });
    })
    .catch(error => {
      console.log(error);
      res.status(500).send('There was an error authenticating the user.');
    });
});

app.post("/users/communities", (req, res) => {
  if (!(req.body.communityId in allRecommendations)) {
    res.sendStatus(404);
  } else {
    if (!(req.body.userId in usersInCommunities)) {
      usersInCommunities[req.body.userId] = [];
    }
    if (!usersInCommunities[req.body.userId].includes(req.body.communityId)) {
      usersInCommunities[req.body.userId].push(req.body.communityId);
    }
    res.sendStatus(204);
  }
})

app.post("/communities", (req, res) => {
  const newRecId = uuidv4();
  const alreadyCreatedIds = Object.keys(allRecommendations)
                            .filter(recId => allRecommendations[recId].startedBy == req.session.userId);
  if (alreadyCreatedIds.length > 0) {
    res.status(400).send({communityId: alreadyCreatedIds[0]});
    return;
  }
  allRecommendations[newRecId] = {
    "name": req.body.name,
    "filters": req.body.filters,
    "started": Date.now(),
    "recs": [],
    "startedBy": req.session.userId
  };
  if (!(req.body.userId in usersInCommunities)) {
    usersInCommunities[req.session.userId] = [];
  }
  usersInCommunities[req.session.userId].push(newRecId);
  res.send(buildCommunityReturnObject(newRecId, req.session.userId));
})

app.get("/communities", (req, res) => {
  if (!(req.session.userId in usersInCommunities)) {
    res.send([]);
  } else {
    res.send(usersInCommunities[req.session.userId].map((communityId) => {
      return buildCommunityReturnObject(communityId, req.session.userId);
    }))
  }
})

app.get("/communities/:id/recommendations", (req, res) => {
  if (!(req.params.id in allRecommendations)) {
    res.sendStatus(404);
  } else {
    const recs = allRecommendations[req.params.id].recs.map(rec => {
        return buildRecommendationReturnObject(rec, req.session.userId);
      }).sort((a, b) => (a.plus1s > b.plus1s) ? -1 : 1);
    res.send({
      recs: recs,
      filters: allRecommendations[req.params.id].filters
    });
  }
})

app.post("/communities/:id/recommendations", (req, res) => {
  if (!(req.params.id in allRecommendations)) {
    res.sendStatus(404);
  } else {
    const existingRec = allRecommendations[req.params.id].recs
                          .filter(rec => rec.submittedBy == req.session.userId).length > 0;
    if (existingRec) {
      res.status(403).send({"error": "Already submitted a rec."});
    } else {
      if (!passesFilters(allRecommendations[req.params.id].filters, req.body.rec)) {
        res.status(400).send({"error": "Community filters are on and this doesn't match."});
      } else {
        const newRec = {
          "id": uuidv4(),
          "rec": req.body.rec,
          "plus1s": [req.session.userId],
          "submittedBy": req.session.userId
        };
        allRecommendations[req.params.id].recs.push(newRec);
        res.send(buildRecommendationReturnObject(newRec, req.session.userId));
      }
    }
  }
})

app.post("/communities/:id/recommendations/:recid/plusOne", (req, res) => {
  if (!(req.params.id in allRecommendations)) {
    res.sendStatus(404);
  } else {
    let found = false;
    for (let i = 0; i < allRecommendations[req.params.id].recs.length; i++) {
      if (allRecommendations[req.params.id].recs[i].id == req.params.recid) {
        found = true;
        const alreadyRecommended = allRecommendations[req.params.id].recs[i].plus1s
                                    .filter(plus1 => plus1 == req.session.userId).length > 0;
        if (alreadyRecommended) {
          res.status(403).send({"error": "Already +1'd."});
          return;
        } else {
          allRecommendations[req.params.id].recs[i].plus1s.push(req.session.userId);
        }
      }
    }
    if (!found) {
      res.sendStatus(404);
    } else {
      res.sendStatus(204);
    }
  }
})

function buildCommunityReturnObject(communityId, userId) {
  return {
    id: communityId,
    name: allRecommendations[communityId].name,
    filters: allRecommendations[communityId].filters,
    startedByUser: allRecommendations[communityId].startedBy == userId
  };
}

function buildRecommendationReturnObject(rec, userId) {
  const alreadyPlus1d = rec.plus1s.indexOf(userId) != -1
  return {
    id: rec.id,
    plus1s: rec.plus1s.length,
    alreadyPlus1d: alreadyPlus1d,
    rec: rec.rec,
    submittedByUser: userId == rec.submittedBy
  }
}

const youtubeRegex = new RegExp("^http(s)?:\/\/(www\.)?youtu(\.)?be(.com)?");
const imageFilter = new RegExp("\.(jpeg|jpg|gif|png)$")
function passesFilters(filters, rec) {
  if (filters.length === 0) {
    return true;
  }
  if (filters.youtube && youtubeRegex.test(rec)) {
    return true;
  } else if (filters.image && imageFilter.test(rec)) {
    return true;
  }
  return false;
}

setInterval(() => {
  const now = Date.now();
  Object.keys(allRecommendations).forEach(communityId => {
    if (now - allRecommendations[communityId].started > COMMUNITY_TIMEOUT) {
      delete allRecommendations[communityId];
      Object.keys(usersInCommunities).forEach(userId => {
        usersInCommunities[userId] = usersInCommunities[userId].filter(commId => commId!=communityId);
      })
    }
  })
}, 60 * 1000)