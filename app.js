const express = require("express");

const app = express();

app.use(express.json());

const bcrypt = require("bcrypt");

const jwt = require("jsonwebtoken");

const { open } = require("sqlite");

const path = require("path");

const dbPath = path.join(__dirname, "twitterClone.db");
console.log(dbPath);

const sqlite3 = require("sqlite3");

let db = null;

const intializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB error ${error.message}`);
  }
};

intializeDbAndServer();

// malware function

const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];

  let jwtToken;

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.user_id = payload.user_id;
        next();
      }
    });
  }
};

// register

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashPassword = await bcrypt.hash(password, 10);
      const addUserQuery = `INSERT INTO user(username,password,name,gender)
                                VALUES(
                                    '${username}',
                                    '${hashPassword}',
                                    '${name}',
                                    '${gender}'
                                    )`;
      await db.run(addUserQuery);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// login

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkingPass = await bcrypt.compare(password, dbUser.password);
    if (checkingPass === true) {
      const getUserIdquery = `SELECT user_id FROM user WHERE username = '${username}'`;
      const dbUserId = await db.get(getUserIdquery);
      const payload = { username: username, user_id: dbUserId.user_id };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid Password");
    }
  }
});

// get /user/tweets/feed/

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username, user_id } = request;
  const getUserQuery = `SELECT username,tweet,date_time as dateTime FROM (tweet INNER JOIN follower ON tweet.user_id = follower.following_user_id) AS T
                          INNER JOIN user ON T.user_id = user.user_id WHERE follower_user_id = ${4} ORDER BY date_time DESC LIMIT 4`;
  const dbUser = await db.all(getUserQuery);
  response.send(dbUser);
});

// get /user/following/

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username, user_id } = request;
  const getUserQuery = `SELECT name FROM (user INNER JOIN follower ON user.user_id = follower.following_user_id) AS T
                          WHERE follower_user_id = ${4}`;
  const dbUser = await db.all(getUserQuery);
  response.send(dbUser);
});

// get /user/followers/

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const getUserQuery = `SELECT name FROM follower INNER JOIN user ON follower.follower_user_id = user.user_id
                          WHERE follower.following_user_id = ${4} `;
  const dbUser = await db.all(getUserQuery);
  response.send(dbUser);
});

// get /tweets/:tweetId/

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const getTweetAndDateQuery = `SELECT tweet_id,tweet,date_time as dateTime FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id 
                            WHERE tweet_id = ${tweetId} AND follower_user_id = ${4}`;

  const dbTweetAndDate = await db.get(getTweetAndDateQuery);
  if (dbTweetAndDate === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getLikesCountQuery = `SELECT count(like_id) AS likes FROM like WHERE tweet_id = ${tweetId}`;
    const dbLikesCount = await db.get(getLikesCountQuery);
    const getReplyCountQuery = `SELECT COUNT(reply_id) AS reply FROM reply WHERE tweet_id = ${tweetId}`;
    const dbReplyCount = await db.get(getReplyCountQuery);
    response.send({
      tweet: dbTweetAndDate.tweet,
      likes: dbLikesCount.likes,
      replies: dbReplyCount.reply,
      dateTime: dbTweetAndDate.dateTime,
    });
  }
});

//If the user requests a tweet of a user he is following, return the list of usernames who liked the tweet

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetAndDateQuery = `SELECT tweet_id,tweet,date_time as dateTime FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id 
                            WHERE tweet_id = ${tweetId} AND follower_user_id = ${4}`;

    const dbTweetAndDate = await db.get(getTweetAndDateQuery);
    if (dbTweetAndDate === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikeUsersQuery = `SELECT username FROM like INNER JOIN user ON like.user_id = user.user_id
                                    WHERE tweet_id = ${tweetId}`;
      const dbLikeUsers = await db.all(getLikeUsersQuery);
      const arr = [];
      for (let eachObject of dbLikeUsers) {
        arr.push(eachObject.username);
      }
      response.send({ likes: arr });
    }
  }
);

// If the user requests a tweet of a user he is following, return the list of replies.

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const getTweetAndDateQuery = `SELECT tweet_id,tweet,date_time as dateTime FROM follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id 
                            WHERE tweet_id = ${tweetId} AND follower_user_id = ${4}`;

    const dbTweetAndDate = await db.get(getTweetAndDateQuery);
    if (dbTweetAndDate === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getReplyUsersQuery = `SELECT name,reply FROM reply INNER JOIN user ON reply.user_id = user.user_id
                                     WHERE tweet_id = ${tweetId}`;
      const dbReplyUsers = await db.all(getReplyUsersQuery);
      const arr = [];
      for (let eachObject of dbReplyUsers) {
        arr.push({ name: eachObject.name, reply: eachObject.reply });
      }
      response.send({ replies: arr });
    }
  }
);

// Returns a list of all tweets of the user

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { user_id } = request;
  const getTweetAndDateQuery = `SELECT tweet_id,tweet,date_time  FROM tweet WHERE user_id = ${user_id}`;

  const dbTweetAndDate = await db.all(getTweetAndDateQuery);

  let arr = [];

  for (let eachObject of dbTweetAndDate) {
    const getReplyUsersQuery = `SELECT COUNT(reply_id) AS replies FROM reply WHERE tweet_id = ${eachObject.tweet_id}`;
    const dbReplyUsers = await db.get(getReplyUsersQuery);

    const getlikeUsersQuery = `SELECT COUNT(like_id) AS likes FROM like WHERE tweet_id = ${eachObject.tweet_id}`;
    const dbLikeUsers = await db.get(getlikeUsersQuery);

    arr.push({
      tweet: eachObject.tweet,
      likes: dbLikeUsers.likes,
      replies: dbReplyUsers.replies,
      dateTime: eachObject.date_time,
    });
  }

  response.send(arr);
});

// Create a tweet in the tweet table

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { user_id } = request;
  const { tweet } = request.body;
  const date_time = new Date();
  const addTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time)
                            VALUES(
                                '${tweet}',
                                '${user_id}',
                                '${date_time}'
                            )`;

  await db.run(addTweetQuery);
  response.send("Created a Tweet");
});

module.exports = app;

// delete tweet

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { user_id } = request;
    const { tweetId } = request.params;
    const getTweetOfUserQ = `SELECT * FROM tweet WHERE tweet_id = ${tweetId} AND user_id = ${user_id}`;

    const dbTweetOfUser = await db.get(getTweetOfUserQ);

    if (dbTweetOfUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQ = `DELETE FROM tweet WHERE tweet_id = ${tweetId}`;
      await db.run(deleteTweetQ);
      response.send("Tweet Removed");
    }
  }
);
