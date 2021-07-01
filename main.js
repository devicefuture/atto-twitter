const express = require("express");
const open = require("open");
const Twit = require("twit");

const URL_BASE = "https://jamesl.me/atto";
const TWITTER_USERNAME = "codeurdreams";
const TWITTER_MAX_ALT_TEXT_LENGTH = 420;

var app = express();
var T = new Twit({}); // TODO: Add config data from environment variables
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

        var url = `${URL_BASE}?code=${encodeURIComponent(this.code)}`;

        open(url);

        this.reply = `Run and edit live at: ${url}`;
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

app.post("/fulfil/:id", express.json(), function(req, res) {
    for (var i = 0; i < requestQueue.length; i++) {
        if (requestQueue[i].originStatusId == req.params.id) {
            requestQueue[i].fulfil(req.body);

            res.status(200);

            return;
        }
    }

    res.status(404);
});

app.listen("3000", function() {
    console.log("Listening at localhost:3000");

    stream.on("tweet", tweetRequestEvent);

    new Request(`10 print "Hello, world!"\n20 goto 10`);
});