define([
    'jquery',
    'underscore',
    'backbone',
    'moment',
    'iznik/base',
    'iznik/views/modal'
], function($, _, Backbone, moment, Iznik) {
        Iznik.Views.ModTools.User = Iznik.View.extend({
        template: 'modtools_user_user',

        events: {
            'click .js-posts': 'posts',
            'click .js-offers': 'offers',
            'click .js-takens': 'takens',
            'click .js-wanteds': 'wanteds',
            'click .js-receiveds': 'receiveds',
            'click .js-modmails': 'modmails',
            'click .js-others': 'others',
            'click .js-logs': 'logs',
            'click .js-remove': 'remove',
            'click .js-ban': 'ban',
            'click .js-addcomment': 'addComment',
            'click .js-spammer': 'spammer',
            'click .js-whitelist': 'whitelist'
        },

        showPosts: function(offers, wanteds, takens, receiveds, others) {
            var v = new Iznik.Views.ModTools.User.PostSummary({
                model: this.model,
                collection: this.historyColl,
                offers: offers,
                wanteds: wanteds,
                takens: takens,
                receiveds: receiveds,
                others: others
            });

            v.render();
        },

        posts: function() {
            this.showPosts(true, true, true, true, true);
        },

        offers: function() {
            this.showPosts(true, false, false, false, false);
        },

        wanteds: function() {
            this.showPosts(false, true, false, false, false);
        },

        takens: function() {
            this.showPosts(false, false, true, false, false);
        },

        receiveds: function() {
            this.showPosts(false, false, false, true, false);
        },

        others: function() {
            this.showPosts(false, false, false, false, true);
        },

        modmails: function() {
            var self = this;
            var v = new Iznik.Views.ModTools.User.ModMails({
                model: self.model,
                modmailsonly: true
            });

            v.render();
        },

        whitelist: function() {
            var self = this;

            var v = new Iznik.Views.ModTools.EnterReason();
            self.listenToOnce(v, 'reason', function(reason) {
                $.ajax({
                    url: API + 'spammers',
                    type: 'POST',
                    data: {
                        userid: self.model.get('id'),
                        reason: reason,
                        collection: 'Whitelisted'
                    }, success: function(ret) {
                        // Now over to someone else to review this report - so remove from our list.
                        self.clearSuspect();
                    }
                });
            });

            v.render();
        },

        logs: function() {
            var self = this;
            var v = new Iznik.Views.ModTools.User.Logs({
                model: self.model
            });

            v.render();
        },

        spammer: function() {
            var self = this;
            var v = new Iznik.Views.ModTools.EnterReason();
            self.listenToOnce(v, 'reason', function(reason) {
                $.ajax({
                    url: API + 'spammers',
                    type: 'POST',
                    data: {
                        userid: self.model.get('id'),
                        reason: reason,
                        collection: 'PendingAdd'
                    }, success: function(ret) {
                        (new Iznik.Views.ModTools.User.Reported().render());
                    }
                });
            });
            v.render();
        },

        remove: function() {
            // Remove membership
            var self = this;

            var v = new Iznik.Views.Confirm({
                model: self.modConfigModel
            });

            self.listenToOnce(v, 'confirmed', function() {
                var mod = new Iznik.Models.Membership({
                    userid: this.model.get('id'),
                    groupid: this.model.get('groupid')
                });

                mod.fetch().then(function () {
                    mod.destroy({
                        success: function (model, response) {
                            self.model.trigger('removed');
                        }
                    });
                });
            });

            v.render();
        },

        ban: function() {
            // Ban them - remove with appropriate flag.
            var self = this;

            var v = new Iznik.Views.Confirm({
                model: self.modConfigModel
            });

            self.listenToOnce(v, 'confirmed', function() {
                $.ajax({
                    url: API + 'memberships',
                    type: 'DELETE',
                    data: {
                        userid: this.model.get('id'),
                        groupid: this.model.get('groupid'),
                        ban: true
                    }, success: function(ret) {
                        if (ret.ret == 0) {
                            self.$el.fadeOut('slow');
                        }
                    }
                });
            });

            v.render();
        },

        addComment: function() {
            var self = this;

            var model = new Iznik.Models.ModTools.User.Comment({
                userid: this.model.get('id'),
                groupid: this.model.get('groupid')
            });

            var v = new Iznik.Views.ModTools.User.CommentModal({
                model: model
            });

            // When we close, update what's shown.
            this.listenToOnce(v, 'modalClosed', function() {
                self.model.fetch().then(function() {
                    self.render()
                });
            });

            v.render();
        },

        render: function() {
            var self = this;
            this.$el.html(window.template(this.template)(this.model.toJSON2()));

            self.historyColl = new Iznik.Collections.ModTools.MessageHistory();
            _.each(this.model.get('messagehistory'), function(message, index, list) {
                self.historyColl.add(new Iznik.Models.ModTools.User.MessageHistoryEntry(message));
            });

            this.$('.js-msgcount').html(this.historyColl.length);

            if (this.historyColl.length == 0) {
                this.$('.js-msgcount').closest('.btn').addClass('disabled');
            }

            var counts = {
                Offer: 0,
                Wanted: 0,
                Taken: 0,
                Received: 0,
                Other: 0
            };

            this.historyColl.each(function(message) {
                if (counts.hasOwnProperty(message.get('type'))) {
                    counts[message.get('type')]++;
                }
            });

            _.each(counts, function(value, key, list) {
                self.$('.js-' + key.toLowerCase() + 'count').html(value);
            });

            var modcount = this.model.get('modmails');
            self.$('.js-modmailcount').html(modcount);

            if (modcount > 0) {
                self.$('.js-modmailcount').closest('.badge').addClass('btn-danger');
                self.$('.js-modmailcount').addClass('white');
                self.$('.glyphicon-warning-sign').addClass('white');
            }

            var comments = this.model.get('comments');
            _.each(comments, function(comment) {
                if (comment.groupid) {
                    comment.group = Iznik.Session.getGroup(comment.groupid).toJSON2();
                }

                self.$('.js-comments').append((new Iznik.Views.ModTools.User.Comment({
                    model: new Iznik.Models.ModTools.User.Comment(comment)
                })).render().el);
            });

            if (!comments || comments.length == 0) {
                self.$('.js-comments').hide();
            }

            var spammer = this.model.get('spammer');
            if (spammer) {
                var v = new Iznik.Views.ModTools.User.SpammerInfo({
                    model: new Iznik.Model(spammer)
                });

                self.$('.js-spammerinfo').append(v.render().el);
            }

            if (Iznik.Session.isAdmin()) {
                self.$('.js-adminonly').removeClass('hidden');
            }

            return (this);
        }
    });

    Iznik.Views.ModTools.User.PostSummary = Iznik.Views.Modal.extend({
        template: 'modtools_user_postsummary',

        render: function() {
            var self = this;

            this.$el.html(window.template(this.template)(this.model.toJSON2()));
            this.collection.each(function(message) {
                var type = message.get('type');
                var display = false;

                switch (type) {
                    case 'Offer': display = self.options.offers; break;
                    case 'Wanted': display = self.options.wanteds; break;
                    case 'Taken': display = self.options.takens; break;
                    case 'Received': display = self.options.receiveds; break;
                    case 'Other': display = self.options.others; break;
                }

                if (display) {
                    var v = new Iznik.Views.ModTools.User.SummaryEntry({
                        model: message
                    });
                    self.$('.js-list').append(v.render().el);
                }
            });

            this.open(null);

            return(this);
        }
    });

    Iznik.Views.ModTools.User.SummaryEntry = Iznik.View.extend({
        template: 'modtools_user_summaryentry',

        render: function() {
            this.$el.html(window.template(this.template)(this.model.toJSON2()));
            var mom = new moment(this.model.get('date'));
            this.$('.js-date').html(mom.format('llll'));
            return(this);
        }
    });

    Iznik.Views.ModTools.User.Reported = Iznik.Views.Modal.extend({
        template: 'modtools_user_reported'
    });

    Iznik.Views.ModTools.User.Logs = Iznik.Views.Modal.extend({
        template: 'modtools_user_logs',

        context: null,

        events: {
            'click .js-more': 'more'
        },

        first: true,

        moreShown: false,
        more: function() {
            this.getChunk();
        },

        addLog: function(log) {
            var v = new Iznik.Views.ModTools.User.LogEntry({
                model: new Iznik.Model(log)
            });

            this.$('.js-list').append(v.render().el);
        },

        getChunk: function() {
            var self = this;

            this.model.fetch({
                data: {
                    logs: true,
                    modmailsonly: self.options.modmailsonly,
                    logcontext: this.logcontext
                },
                success: function(model, response, options) {
                    self.logcontext = response.logcontext;

                    // TODO This can't be right.
                    if ((response.hasOwnProperty('user') && response.user.logs.length > 0) ||
                        (response.hasOwnProperty('member') && response.member.logs.length > 0)) {
                        self.$('.js-more').show();
                    }
                }
            }).then(function() {
                self.$('.js-loading').hide();
                var logs = self.model.get('logs');

                _.each(logs, function (log) {
                    self.addLog(log);
                });

                if (!self.moreShown) {
                    self.moreShown = true;
                }

                if (self.first && (_.isUndefined(logs) || logs.length == 0)) {
                    self.$('.js-none').show();
                }

                self.first = false;
            });
        },

        render: function() {
            var self = this;

            this.$el.html(window.template(this.template)(this.model.toJSON2()));

            this.open(null);
            this.getChunk();

            return(this);
        }
    });

    Iznik.Views.ModTools.User.LogEntry = Iznik.View.extend({
        template: 'modtools_user_logentry',

        render: function() {
            this.$el.html(window.template(this.template)(this.model.toJSON2()));
            var mom = new moment(this.model.get('timestamp'));
            this.$('.js-date').html(mom.format('DD-MMM-YY HH:mm'));
            return(this);
        }
    });

    // Modmails are very similar to logs.
    Iznik.Views.ModTools.User.ModMails = Iznik.Views.ModTools.User.Logs.extend({
        template: 'modtools_user_modmails',
        addLog: function(log) {
            var v = new Iznik.Views.ModTools.User.ModMailEntry({
                model: new Iznik.Model(log)
            });

            this.$('.js-list').append(v.render().el);
        }
    });

    Iznik.Views.ModTools.User.ModMailEntry = Iznik.View.extend({
        template: 'modtools_user_logentry',

        render: function() {
            var self = this;

            this.$el.html(window.template(this.template)(this.model.toJSON2()));
            var mom = new moment(this.model.get('timestamp'));
            this.$('.js-date').html(mom.format('DD-MMM-YY HH:mm'));

            // The log template will add logs, but highlighted.  We want to remove the highlighting for the modmail
            // display.
            this.$('div.nomargin.alert.alert-danger').removeClass('nomargin alert alert-danger');

            return(this);
        }
    });

    Iznik.Views.ModTools.Member = Iznik.View.extend({
        rarelyUsed: function() {
            this.$('.js-rarelyused').fadeOut('slow');
            this.$('.js-stdmsgs li').fadeIn('slow');
        },

        addOtherInfo: function() {
            var self = this;
            var thisemail = self.model.get('email');

            // Add any other emails
            self.$('.js-otheremails').empty();
            _.each(self.model.get('otheremails'), function(email) {
                if (email.email != thisemail) {
                    var mod = new Iznik.Model(email);
                    var v = new Iznik.Views.ModTools.Message.OtherEmail({
                        model: mod
                    });
                    self.$('.js-otheremails').append(v.render().el);
                }
            });

            // Restrict how many we show
            self.$('.js-otheremails').showFirst({
                controlTemplate: '<div><span class="badge">+[REST_COUNT] more</span>&nbsp;<a href="#" class="show-first-control">show</a></div>',
                count: 5
            });

            // Add any other group memberships we need to display.
            self.$('.js-memberof').empty();
            var groupids = [ self.model.get('groupid') ];
            _.each(self.model.get('memberof'), function(group) {
                if (groupids.indexOf(group.id) == -1) {
                    var mod = new Iznik.Model(group);
                    var v = new Iznik.Views.ModTools.Member.Of({
                        model: mod
                    });
                    self.$('.js-memberof').append(v.render().el);
                    groupids.push(group.id);
                }
            });

            self.$('.js-applied').empty();
            _.each(self.model.get('applied'), function(group) {
                if (groupids.indexOf(group.id) == -1) {
                    // Don't both displaying applications to groups we've just listed as them being a member of.
                    var mod = new Iznik.Model(group);
                    var v = new Iznik.Views.ModTools.Member.Applied({
                        model: mod
                    });
                    self.$('.js-applied').append(v.render().el);
                }
            });

            // Don't show too many.
            self.$('.js-memberof').showFirst({
                controlTemplate: '<div><span class="badge">+[REST_COUNT] more</span>&nbsp;<a href="#" class="show-first-control">show</a></div>',
                count: 5
            });
            self.$('.js-applied').showFirst({
                controlTemplate: '<div><span class="badge">+[REST_COUNT] more</span>&nbsp;<a href="#" class="show-first-control">show</a></div>',
                count: 5
            });
        }
    });

    Iznik.Views.ModTools.Member.OtherEmail = Iznik.View.extend({
        template: 'modtools_member_otheremail'
    });

    Iznik.Views.ModTools.Member.Of = Iznik.View.extend({
        template: 'modtools_member_of'
    });

    Iznik.Views.ModTools.Member.Applied = Iznik.View.extend({
        template: 'modtools_member_applied'
    });

    Iznik.Views.ModTools.User.Comment = Iznik.View.extend({
        template: 'modtools_user_comment',

        events: {
            'click .js-editnote': 'edit',
            'click .js-deletenote': 'deleteMe'
        },

        edit: function() {
            var v = new Iznik.Views.ModTools.User.CommentModal({
                model: this.model
            });

            this.listenToOnce(v, 'modalClosed', this.render);

            v.render();
        },

        deleteMe: function() {
            this.model.destroy().then(this.remove());
        },

        render: function() {
            this.$el.html(window.template(this.template)(this.model.toJSON2()));

            var hideedit = true;
            var group = this.model.get('group');
            if (group && (group.role == 'Moderator' || group.role == 'Moderator')) {
                // We are a mod on this group - we can modify it.
                hideedit = false;
            }

            if (hideedit) {
                self.$('.js-editnote, js-deletenote').hide();
            }

            this.$('.timeago').timeago();
            return(this);
        }
    });

    Iznik.Views.ModTools.User.CommentModal = Iznik.Views.Modal.extend({
        template: 'modtools_user_comment_modal',

        events: {
            'click .js-save': 'save'
        },

        save: function() {
            var self = this;

            self.model.save().then(function() {
                self.close();
            });
        },

        render2: function() {
            var self = this;

            self.open(null);

            self.fields = [
                {
                    name: 'user1',
                    control: 'input',
                    placeholder: 'Add a comment about this member here'
                },
                {
                    name: 'user2',
                    control: 'input',
                    placeholder: '...and more information here'
                },
                {
                    name: 'user3',
                    control: 'input',
                    placeholder: '...and here'

                },
                {
                    name: 'user4',
                    control: 'input',
                    placeholder: 'You get the idea.'
                },
                {
                    name: 'user5',
                    control: 'input'
                },
                {
                    name: 'user6',
                    control: 'input'
                },
                {
                    name: 'user7',
                    control: 'input'
                },
                {
                    name: 'user8',
                    control: 'input'
                },
                {
                    name: 'user9',
                    control: 'input'
                },
                {
                    name: 'user10',
                    control: 'input'
                },
                {
                    name: 'user11',
                    control: 'input'
                }
            ];

            self.form = new Backform.Form({
                el: $('#js-form'),
                model: self.model,
                fields: self.fields
            });

            self.form.render();

            // Make it full width.
            self.$('label').remove();
            self.$('.col-sm-8').removeClass('col-sm-8').addClass('col-sm-12');

            // Layout messes up a bit.
            self.$('.form-group').addClass('clearfix');

            // Turn on spell-checking
            self.$('textarea, input:text').attr('spellcheck', true);
        },

        render: function() {
            var self = this;

            this.$el.html(window.template(this.template)(this.model.toJSON2()));

            if (self.model.get('id')) {
                // We want to refetch the model to make sure we edit the most up to date settings.
                self.model.fetch().then(self.render2.call(self));
            } else {
                // We're adding one; just render it.
                self.render2();
            }

            return(this);
        }
    });

    Iznik.Views.ModTools.User.SpammerInfo = Iznik.View.extend({
        template: 'modtools_user_spammerinfo',

        render: function() {
            this.$el.html(window.template(this.template)(this.model.toJSON2()));
            this.$('.timeago').timeago();
            return(this);
        }
    });
    
    Iznik.Views.ModTools.EnterReason = Iznik.Views.Modal.extend({
        template: 'modtools_members_spam_reason',

        events: {
            'click .js-cancel': 'close',
            'click .js-confirm': 'confirm'
        },

        confirm: function () {
            var self = this;
            var reason = self.$('.js-reason').val();

            if (reason.length < 3) {
                self.$('.js-reason').focus();
            } else {
                self.trigger('reason', reason);
                self.close();
            }
        },

        render: function () {
            var self = this;
            this.open(this.template);

            return (this);
        }
    });
});