const express = require("express");
const cors = require("cors");
const open = require("open");
const base2048 = require("base2048");
const Twit = require("twit");

require("dotenv").config();

const INSTANCE_URL_BASE = process.env.ATTO_INSTANCE_URL;
const PUBLIC_URL_BASE = process.env.ATTO_PUBLIC_URL;
const TWITTER_USERNAME = process.env.TWITTER_USERNAME;
const TWITTER_MAX_ALT_TEXT_LENGTH = 420;

var app = express();

var T = new Twit({
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token: process.env.TWITTER_ACCESS_TOKEN,
    access_token_secret: process.env.TWITTER_ACCESS_SECRET,
    timeout_ms: 60 * 1000,
    strictSSL: true
});

var stream = T.stream("statuses/filter", {track: ["@" + TWITTER_USERNAME], tweet_mode: "extended"});

var requestQueue = [];

class Request {
    constructor(code, originUser, originStatusId) {
        this.code = code.startsWith("🗜️") ? code : this.constructor.sanitiseCode(code);
        this.originUser = originUser;
        this.originStatusId = originStatusId;

        this.reply = "";
        this.running = false;
        this.fulfilled = false;

        if (/^\d{1,6}/.exec(this.code) || this.code.startsWith("🗜️")) {
            console.log("Accepted code");
            this.runCode(this.code.startsWith("🗜️"));
        } else {
            // Ignore non-code Tweets
            console.log("Rejected code");

            this.fulfilled = true;
        }
    }

    static sanitiseCode(code) {
        return (code
            .replace(/[“”]/g, "\"")
            .replace(/[‘’]/g, "'")
        ).trim();
    }

    runCode(inBase2048 = false) {
        if (inBase2048) {
            try {
                this.code = new TextDecoder().decode(base2048.decode(this.code.replace(/^🗜️\s*/, "").trim()));
            } catch (e) {
                console.log("Couldn't decode base2048");

                this.reply = `@${this.originUser} Sorry, however the base2048 code you provided is invalid. Try using the Tweet button at jamesl.me/atto`;

                this.tweetError();

                return;
            }
        }

        console.log("Started running code");

        this.running = true;

        var urlSuffix = `?code=${encodeURIComponent(this.code)}`;

        open(INSTANCE_URL_BASE + urlSuffix + `&bot=${this.originStatusId}`);

        this.reply = `@${this.originUser} Run and edit live at: ${PUBLIC_URL_BASE}${urlSuffix}`;
    }

    tweetError() {
        T.post("statuses/update", {
            status: this.reply,
            in_reply_to_status_id: this.originStatusId
        });

        console.log("Posted error Tweet");

        this.running = false;
        this.fulfilled = true;
    }

    fulfil(requestData) {
        var thisScope = this;

        console.log("Beginning fulfilment");

        T.post("media/upload", {media_data: requestData.content}, function(error, uploadData, response) {
            if (error) {
                console.error(error);

                return;
            }

            T.post("media/metadata/create", {
                media_id: uploadData.media_id_string,
                alt_text: {text: requestData.altText.substring(Math.max(requestData.altText.length - TWITTER_MAX_ALT_TEXT_LENGTH, 0))}
            }, function(error, altData, response) {
                if (error) {
                    console.error(error);
    
                    return;
                }

                T.post("statuses/update", {
                    status: thisScope.reply,
                    in_reply_to_status_id: thisScope.originStatusId,
                    media_ids: uploadData.media_id_string
                });

                console.log("Posted Tweet");
            });
        });

        this.running = false;
        this.fulfilled = true;
    }
}

function tweetRequestEvent(tweet) {
    console.log(`Found Tweet from @${tweet.user.screen_name}`);

    if (!(tweet.in_reply_to_screen_name == TWITTER_USERNAME || tweet.text.includes("@" + TWITTER_USERNAME + " "))) {
        console.log("Rejected since it's not directed at us");

        return;
    }

    console.log("Accepted since it's directed at us");

    requestQueue = requestQueue.filter((i) => !i.fulfilled);

    requestQueue.push(new Request((tweet.extended_tweet?.full_text || tweet.text).split("@" + TWITTER_USERNAME + " ")[1]?.trim() || "", tweet.user.screen_name, tweet.id_str));

    console.log(`Request queue is now length ${requestQueue.length}`);
}

app.use(cors());

app.post("/fulfil/:id", express.json({limit: "1mb"}), function(req, res) {
    console.log(`Received fulfilment request from ${req.params.id}`);

    for (var i = 0; i < requestQueue.length; i++) {
        if (requestQueue[i].originStatusId == req.params.id) {
            requestQueue[i].fulfil(req.body);

            res.status(200).end();

            return;
        }
    }

    res.status(404).end();
});

app.listen("3000", function() {
    console.log("Listening at localhost:3000");

    stream.on("tweet", tweetRequestEvent);

    stream.on("connect", function() {
        console.log("Attempting to connect to stream...");
    });

    stream.on("connected", function() {
        console.log("Connected to stream");
    });

    stream.on("disconnect", function() {
        console.log("Disconnected from stream");
    });

    stream.on("reconnect", function() {
        console.log("Reconnecting to stream...");
    });

    stream.on("error", function(error) {
        console.error(error);
    });

    stream.on("warning", function(warning) {
        console.warning(warning);
    });

    stream.on("limitation", function(error) {
        console.error(error);
    });
});