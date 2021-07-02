const express = require("express");
const cors = require("cors");
const open = require("open");
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
    access_secret: process.env.TWITTER_TOKEN_SECRET,
    timeout_ms: 60 * 1000,
    strictSSL: true
});

var stream = T.stream("user");

var requestQueue = [];

class Request {
    constructor(code, originStatusId) {
        this.code = code;
        this.originStatusId = originStatusId;

        this.reply = "";
        this.running = false;
        this.fulfilled = false;

        this.runCode();
    }

    runCode() {
        this.running = true;

        var urlSuffix = `?code=${encodeURIComponent(this.code)}&bot=${this.originStatusId}`;

        open(INSTANCE_URL_BASE + urlSuffix);

        this.reply = `Run and edit live at: ${PUBLIC_URL_BASE}${urlSuffix}`;
    }

    fulfil(requestData) {
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
                    status: this.reply,
                    in_reply_to_status_id: this.originStatusId,
                    media_ids: uploadData.media_id_string
                });
            });
        });

        this.running = false;
        this.fulfilled = true;
    }
}

function tweetRequestEvent(tweet) {
    if (!(tweet.in_reply_to_screen_name == TWITTER_USERNAME || tweet.text.includes("@" + TWITTER_USERNAME + " "))) {
        return;
    }

    requestQueue = requestQueue.filter((i) => !i.fulfilled);

    requestQueue.push(new Request(tweet.text.replace("@" + TWITTER_USERNAME + " ", ""), tweet.id_str));
}

app.use(cors());

app.post("/fulfil/:id", express.json({limit: "1mb"}), function(req, res) {
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

    requestQueue.push(new Request(`10 print "Hello, world!"\n20 goto 10`, "test123"));
});