define([
    'jquery',
    'underscore',
    'backbone',
    'iznik/base',
    'iznik/views/pages/pages',
    'iznik/models/membership'
], function($, _, Backbone, Iznik) {
    Iznik.Views.User.Pages.Stories = Iznik.Views.Page.extend({
        template: "user_stories_main",

        events: {
            'click .js-add': 'addStory'
        },

        addStory: function() {
            var self = this;

            self.listenToOnce(Iznik.Session, 'loggedIn', function (loggedIn) {
                var v = new Iznik.Views.User.Pages.Stories.Add();
                v.render();
            });

            Iznik.Session.forceLogin();
        },

        render: function () {
            var self = this;

            var p = Iznik.Views.Page.prototype.render.call(this);

            p.then(function(self) {
                self.collection = new Iznik.Collections.Members.Stories();

                // CollectionView handles adding/removing/sorting for us.
                self.collectionView = new Backbone.CollectionView({
                    el: self.$('.js-list'),
                    modelView: Iznik.Views.User.Pages.Stories.One,
                    collection: self.collection
                });

                self.collectionView.render();

                self.collection.fetch();
            });

            return(p);
        }
    });

    Iznik.Views.User.Pages.Stories.Thankyou = Iznik.Views.Modal.extend({
        template: 'user_stories_thankyou'
    });

    Iznik.Views.User.Pages.Stories.Add = Iznik.Views.Modal.extend({
        template: 'user_stories_add',

        events: {
            'click .js-add': 'addStory'
        },

        addStory: function() {
            var self = this;
            self.$('.error').removeClass('error');

            var headline = self.$('.js-headline').val();
            if (headline.length == 0) {
                self.$('.js-headline').addClass('error');
            } else {
                var story = self.$('.js-story').val();
                if (story.length == 0) {
                    self.$('.js-story').addClass('error');
                } else {
                    var public = self.$('input[name=js-public]:checked').val();

                    $.ajax({
                        url: API + 'stories',
                        type: 'PUT',
                        data: {
                            headline: headline,
                            story: story,
                            public: public
                        }, success: function(ret) {
                            if (ret.ret == 0) {
                                self.close();
                                var v = new Iznik.Views.User.Pages.Stories.Thankyou();
                                v.render();
                            }
                        }
                    })
                }
            }
        }
    });

    Iznik.Views.User.Pages.Stories.One = Iznik.View.extend({
        template: 'user_stories_one'
    });
});