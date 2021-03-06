define([
    'jquery',
    'underscore',
    'backbone',
    'moment',
    'iznik/base',
    "iznik/modtools",
    "iznik/models/social",
    'iznik/views/pages/pages',
    'iznik/views/infinite'
], function($, _, Backbone, moment, Iznik) {
    Iznik.Views.ModTools.Pages.SocialActions = Iznik.Views.Infinite.extend({
        modtools: true,

        template: "modtools_socialactions_main",

        retField: 'socialactions',

        render: function () {
            var self = this;
            var p = Iznik.Views.Infinite.prototype.render.call(this);

            p.then(function(self) {
                require(['iznik/facebook'], function(FBLoad) {
                    self.listenToOnce(FBLoad(), 'fbloaded', function () {
                        if (!FBLoad().isDisabled()) {
                            self.$('.js-facebookonly').show();
                        }
                    });

                    FBLoad().render();
                });

                var v = new Iznik.Views.Help.Box();
                v.template = 'modtools_socialactions_help';
                v.render().then(function(v) {
                    self.$('.js-help').html(v.el);
                })

                self.lastFetched = null;
                self.context = null;

                self.collection = new Iznik.Collections.SocialActions();

                self.collectionView = new Backbone.CollectionView({
                    el: self.$('.js-list'),
                    modelView: Iznik.Views.ModTools.SocialAction,
                    collection: self.collection
                });

                self.collectionView.render();
                self.fetch();
            });

            return(p);
        }
    });

    Iznik.Views.ModTools.SocialAction = Iznik.View.extend({
        template: 'modtools_socialactions_one',

        render: function() {
            var self = this;
            var p = Iznik.View.prototype.render.call(this);
            p.then(function(self) {
                // Show buttons for the remaining groups that haven't shared this.
                self.$('.js-buttons').empty();
                var grouplist = [];
                var groups = self.model.get('groups');

                _.each(groups, function(groupid) {
                    var group = Iznik.Session.getGroup(groupid);

                    if (group) {
                        //console.log("Consider action for", self.model.get('id'), groupid, group.get('type'), group.get('nameshort'));

                        if (group.get('type') == 'Freegle') {
                            grouplist.push(group);
                        }
                    }
                });

                var groups = new Iznik.Collection(grouplist);
                groups.comparator = 'namedisplay';
                groups.sort();
                
                groups.each(function(group) {
                    var facebook = group.get('facebook');

                    // Page shares happen on the server.  Group ones don't yet so need a Facebook session.
                    // TODO Move to server too.
                    if (facebook.type == 'Page' || (facebook.type == 'Group' && Iznik.Session.hasFacebook())) {
                        var v = new Iznik.Views.ModTools.SocialAction.FacebookPageShare({
                            model: group,
                            actionid: self.model.get('id'),
                            action: self.model
                        });

                        v.render().then(function() {
                            self.$('.js-buttons').append(v.$el);
                        });
                    }
                });
            });

            return(this);
        }
    });

    Iznik.Views.ModTools.SocialAction.FacebookPageShare = Iznik.View.extend({
        template: 'modtools_socialactions_facebookshare',

        tagName: 'li',

        events: {
            'click .js-share': 'share'
        },

        share: function() {
            var self = this;

            if (self.model.get('facebook').type == 'Page' || true) {
                $.ajax({
                    url: API + 'socialactions',
                    type: 'POST',
                    data: {
                        id: self.options.actionid,
                        groupid: self.model.get('id')
                    }
                });
            } else {
                // TODO Move to server too.
                FB.login(function(){
                    var params = JSON.parse(self.options.action.get('data'));
                    var params2;
                    var usersite = $('meta[name=iznikusersite]').attr("content");

                    if (params.hasOwnProperty('link')) {
                        params2 = {
                            link: params.link
                        };
                    }

                    params2.message = params.message;

                    console.log("Params for post", params2);
                    FB.api('/' + self.model.get('facebook').id + '/feed', 'post', params2, function(response) {
                        console.log("Share returned", response);
                        self.$('.js-share').fadeOut('slow');
                    });
                }, {
                    scope: 'user_managed_groups, publish_actions'
                });
            }

            self.$el.fadeOut('slow');
        }
    });
});