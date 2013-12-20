var request = Npm.require('request');
var Fiber = Npm.require('fibers');
var latest_check = new Date().toISOString();
var recent_url = 'http://talkinterest.com:8087/?per_page=100';
var upvotes_url = 'http://talkinterest.com:8087/?start_published_at=NOW-1DAY&end_published_at=NOW&per_page=100';
var one_hour = 1000 * 60 * 60;
var five_mintues = 1000 * 60 * 5;

Meteor.startup(function () {
  setInterval(function(){
    get_latest_stories(recent_url + "&start_published_at=" + latest_check);
  }, five_mintues);

  setInterval(function(){
    update_upvotes(upvotes_url);
  }, one_hour);
});

function update_upvotes(url){
  console.log("upvote updates: ",url);
  request(url, function(err, response, body){
    if (!err){
      try {
        var stories = JSON.parse(body).stories;
        var next_page = JSON.parse(body).next_page;
      } catch(e){
        dumpError(e);
      }

      Fiber(function(){
        _.each(stories, function(story){
          story.id = story.id.toString();
          updateUpvotes(story);
        });
      }).run();

      if (next_page){
        url = url.replace(/&page=\d+/g, '');
        update_upvotes(url + "&page=" + next_page);
      }
    }
  });
}

function updateUpvotes(story){
  var post = Posts.findOne({id: story.id});
  if (post){
    var upvotes = story.upvotes ? story.upvotes : 0;
    Posts.update({id: story.id}, {$set: {votes: upvotes}}, function(err){
      updateScore(Posts, post, true);
      console.log("Upvotes of the story with id: " + story.id + " is added");
    });
  }
}

function get_latest_stories(url){
  console.log(url);
  request(url, function(err, response, body){
    if (!err){
      try {
        var stories = JSON.parse(body).stories;
        var next_page = JSON.parse(body).next_page;
        if (/&page=\d+/.exec(url) == null){
          latest_check = new Date(new Date(stories[0].analyzed_at).getTime() + 1).toISOString();
        }
      } catch(e){
        dumpError(e);
      }

      Fiber(function(){
        _.each(stories, function(story){
          story.id = story.id.toString();
          insertPost(story, function(callback){
//            console.log(callback);
          });
        });
      }).run();

      if (next_page){
        url = url.replace(/&page=\d+/g, '');
        get_latest_stories(url + "&page=" + next_page);
      }
    }
  });
}

function insertPost(story, callback){
  if (story){
    story = add_images_to_story(story);
    var categories = make_categories(story);
    var ready_cats = [];

    var count = _.after(categories.length, function(){
      createPost(story, ready_cats, function(story_id){
        callback(story_id);
      });
    });

    _.each(categories, function(cat, index){
      Categories.upsert(
        {name: cat.name},
        cat,
        function(error){
          if (!error){
            ready_cats.push(Categories.findOne({name: cat.name}));
          }
          count();
        }
      );
    });
  }
}

function createPost(story, cats, callback){
  var story_object = {
    _id: story.id,
    id: story.id,
    author: 'Talkee',
    body: story.description,
    headline: story.title,
    status: 2,
    submitted: (new Date(story.analyzed_at)).valueOf(),
    votes: story.upvotes ? parseInt(story.upvotes) : 0,
    url: story.link,
    categories: cats,
    userId: "9TKY8qtZA4mskkrev",
    baseScore: 0,
    comments: 0
  };

  Posts.upsert({id: story.id}, story_object, function(error){
    if (!error){
      var st = Posts.findOne({id: story.id});
      updateScore(Posts, st, true);
      console.log("Story with id: " + st.id + " is added to Talkee");
      callback(st.id);
    }
  });
}

function add_images_to_story(story){
  if (story.image_link && story.image_link != ""){
    story.description += "<p class='preview-img'><a target='_blank' href='" + story.link +
      "'>![" + story.title + "](" + story.image_link + ")</a></p>";
  }
  return story;
}

function make_categories(story){
  var categories = [];

  if (story && story.topics && story.topics != undefined){
    var topics_json;
    try {
      topics_json = JSON.parse(story.topics_sf);
    } catch(e){
      dumpError(e);
      topics_json = [];
    }

    _.each(topics_json, function(val, key){
      if (story.title.indexOf(key) != -1){
        var decoded_topic = dbpedia_unescape(val)
        categories.push({
          name: decoded_topic,
          hidden: true,
          slug: dbpedia_unescape(val).replace(/ /g, '_')
        });
      }
    });
  }

  if (story && story.categories && story.categories != undefined){
    categories = _.uniq(categories, function(cat){ return cat.slug });
    categories = _.reject(categories, function(cat){
      return (cat.name == story.categories[0]);
    });
    categories.push({
      name: dbpedia_unescape(story.categories[0]),
      hidden: false,
      slug: dbpedia_unescape(story.categories[0]).replace(/ /g, '_')
    });
  }

  categories.push({
    name: dbpedia_unescape(story.source_name),
    hidden: true,
    slug: dbpedia_unescape(story.source_name).replace(/ /g, '_')
  });

  return categories;
}

/**
 * @method dbpedia_unescape
 * @param {String} str
 * @return {String}
 */
function dbpedia_unescape(str) {
  return decodeURIComponent(str).replace(/_/g, " ").replace(/\+/g, " ");
}

/**
  Provides more information about an error

 * @method dumpError
 * @param {Object} err
 */
function dumpError(err) {
  if (typeof err === 'object') {
    if (err.message) {
      console.log('\nMessage: ' + err.message)
    }
    if (err.stack) {
      console.log('\nStacktrace:')
      console.log('====================')
      console.log(err.stack);
    }
  } else {
    console.log('dumpError :: argument is not an object');
  }
}
