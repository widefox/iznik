define([
    'jquery',
    'underscore',
    'backbone',
    'iznik/base',
    'moment',
    "iznik/modtools",
    'iznik/views/pages/pages',
    'iznik/views/pages/modtools/messages_approved',
    'iznik/views/pages/modtools/replay',
    'iznik/models/user/alert',
    'iznik/views/user/user',
    'tinymce',
    'typeahead'
], function($, _, Backbone, Iznik, moment) {
    Iznik.Views.ModTools.Pages.Support = Iznik.Views.Page.extend({
        modtools: true,

        template: "modtools_support_main",

        events: {
            'click .js-searchuser': 'searchUser',
            'click .js-searchmsg': 'searchMessage',
            'click .js-searchgroup': 'searchGroup',
            'keyup .js-searchuserinp': 'keyup',
            'click .js-sendalert': 'sendAlert',
            'click .js-getalerts': 'getAlerts',
            'click .js-addgroup': 'addGroup'
        },

        keyup: function (e) {
            // Search on enter.
            if (e.which == 13) {
                this.$('.js-searchuser').click();
            }
        },

        searchUser: function () {
            var self = this;

            self.$('.js-loading').addClass('hidden');
            var v = new Iznik.Views.PleaseWait({
                timeout: 1
            });
            v.render();

            self.$('.js-searchuserres').empty();

            $.ajax({
                url: API + 'user',
                data: {
                    search: this.$('.js-searchuserinp').val().trim()
                },
                success: function(ret) {
                    v.close();

                    self.$('.js-none').hide();

                    if (ret.ret === 0) {
                        if (ret.users.length === 0) {
                            self.$('.js-none').fadeIn('slow');
                        } else {
                            self.collection = new Iznik.Collection(ret.users);
                            self.collectionView = new Backbone.CollectionView({
                                el: self.$('.js-searchuserres'),
                                modelView: Iznik.Views.ModTools.Member.SupportSearch,
                                collection: self.collection
                            });

                            self.collectionView.render();
                        }
                    }
                }
            });
        },

        searchGroup: function() {
        },

        searchMessage: function () {
            var self = this;

            self.messages = new Iznik.Collections.Messages.SearchAll(null, {
                modtools: true,
                searchmess: self.$('.js-searchmsginp').val(),
                collection: 'Approved'
            });

            self.messagesView = new Backbone.CollectionView({
                el: self.$('.js-searchmsgres'),
                modelView: Iznik.Views.ModTools.Message.SupportSearchResult,
                modelViewOptions: {
                    collection: self.messages,
                    page: self
                },
                collection: self.messages
            });

            self.messagesView.render();

            var v = new Iznik.Views.PleaseWait();
            v.render();

            self.messages.fetch({
                remove: true,
                data: {
                    search: self.$('.js-searchmsginp').val(),
                    exactonly: true
                },
                success: function (collection, response, options) {
                    v.close();

                    if (collection.length == 0) {
                        self.$('.js-msgnone').fadeIn('slow');
                    } else {
                        self.$('.js-msgnone').hide();
                    }
                }
            });
        },

        sendAlert: function () {
            var self = this;
            var html = tinyMCE.activeEditor.getContent({format: 'raw'});
            var text = self.$('.js-mailtext').val();

            // If we've not put anything in the HTML version we get some placeholder HTML.
            html = html == '<p><br data-mce-bogus="1"></p>' ? null : html;
            text = text ? text : 'Please see the HTML version of this mail';

            $.ajax({
                type: 'PUT',
                url: API + 'alert',
                data: {
                    groupid: self.$('.js-grouplist').val(),
                    from: self.$('.js-mailfrom').val(),
                    subject: self.$('.js-mailsubj').val(),
                    text: text,
                    html: html,
                    askclick: self.$('.js-askclick').val(),
                    tryhard: self.$('.js-tryhard').val()
                }, success: function (ret) {
                    if (ret.ret == 0) {
                        self.$('.js-mailerror').hide();
                        self.$('.js-mailsuccess').fadeIn('slow');
                    } else {
                        self.$('.js-mailsuccess').hide();
                        self.$('.js-mailerror').fadeIn('slow');
                    }
                }, error: function () {
                    self.$('.js-mailerror').fadeIn('slow');
                }
            });
        },

        getAlerts: function() {
            var self = this;
            self.$('.js-getalerts').hide();
            self.$('.js-alertshdr').fadeIn('slow');
            self.$('.js-alerts').show();

            var v = new Iznik.Views.PleaseWait({
                timeout: 1
            });
            v.render();

            $.ajax({
                url: API + 'alert',
                type: 'GET',
                success: function(ret) {
                    v.close();
                    var coll = new Iznik.Collection(ret.alerts);
                    var alerts = new Backbone.CollectionView({
                        el: self.$('.js-alerts'),
                        modelView: Iznik.Views.ModTools.Alert,
                        collection: coll
                    });

                    alerts.render();
                }
            })
        },

        substringMatcher: function(strs) {
            return function findMatches(q, cb) {
                var matches, substringRegex;

                // an array that will be populated with substring matches
                matches = [];

                // regex used to determine if a string contains the substring `q`
                substrRegex = new RegExp(q, 'i');

                // iterate through the pool of strings and for any string that
                // contains the substring `q`, add it to the `matches` array
                $.each(strs, function(i, str) {
                    if (substrRegex.test(str)) {
                        matches.push(str);
                    }
                });

                cb(matches);
            };
        },

        addGroup: function() {
            var self = this;
            var name = self.$('.js-addnameshort').val();

            // Minimal verification.
            if (name.length > 0 && name.indexOf(' ') === -1) {
                $.ajax({
                    url: API + 'group',
                    type: 'POST',
                    data: {
                        name: name,
                        grouptype: 'Freegle',
                        action: 'Create'
                    }, success: function(ret) {
                        if (ret.ret === 0) {
                            var group = new Iznik.Models.Group({
                                id: ret.id
                            });

                            group.fetch().then(function() {
                                group.save({
                                    namefull: self.$('.js-addnamefull').val(),
                                    publish: 1,
                                    polyofficial: self.$('.js-addcore').val(),
                                    poly: self.$('.js-addcatchment').val(),
                                    lat: self.$('.js-addlat').val(),
                                    lng: self.$('.js-addlng').val(),
                                    onyahoo: 0,
                                    onhere: 1,
                                    licenserequired: 0,
                                    showonyahoo: 0
                                }, { patch: true }).then(function() {
                                    // Now add ourselves into it.  We will be able to become the owner because
                                    // that's allowed if there are currently no mods.
                                    $.ajax({
                                        url: API + 'memberships',
                                        type: 'PUT',
                                        data: {
                                            groupid: ret.id,
                                            userid: Iznik.Session.get('me').id,
                                            role: 'Owner'
                                        }, success: function(ret) {
                                            if (ret.ret === 0) {
                                                (new Iznik.Views.ModTools.Pages.Support.GroupAdded({
                                                    model: group
                                                })).render();

                                                // Pick up new groups.
                                                Iznik.Session.testLoggedIn(true);
                                            }
                                        }
                                    })
                                });
                            });
                        }
                    }
                });
            }
        },

        render: function () {
            var p = Iznik.Views.Page.prototype.render.call(this);

            p.then(function(self) {
                if (Iznik.Session.isAdmin()) {
                    self.$('.js-adminonly').removeClass('hidden');
                }

                if (Iznik.Session.isAdminOrSupport()) {
                    self.$('.js-adminsupportonly').removeClass('hidden');
                }

                // Group search uses a typehead.
                $.ajax({
                    type: 'GET',
                    url: API + 'groups',
                    data: {
                        grouptype: 'Freegle'
                    }, success: function (ret) {
                        self.groups = ret.groups;
                        self.groupNames = [];
                        _.each(self.groups, function(group) {
                            self.groupNames.push(group.nameshort);
                        });

                        self.typeahead = self.$('.js-searchgroupinp').typeahead({
                            minLength: 2,
                            hint: false,
                            highlight: true
                        }, {
                            name: 'groups',
                            source: self.substringMatcher(self.groupNames)
                        });

                        self.$('.js-searchgroupinp').bind('typeahead:select', function(ev, suggestion) {
                            console.log('Selection: ' + suggestion);
                            var mod = new Iznik.Models.Group({
                                id: suggestion
                            });

                            mod.fetch().then(function() {
                                console.log("Fetched group", mod.attributes);
                                var v = new Iznik.Views.ModTools.Pages.Support.Group({
                                    model: mod
                                });
                                v.render();
                                self.$('.js-searchgroupres').html(v.$el);
                            });
                        });
                    }
                })

                // TODO This should be more generic, but it's really part of hosting multiple networks on the same
                // server, which we don't do.
                var type = Iznik.Session.isAdmin() ? null : 'Freegle';
                type = 'Freegle';
                $.ajax({
                    url: API + 'groups',
                    data: {
                        'grouptype': type
                    }, success: function (ret) {
                        ret.groups = _.sortBy(ret.groups, function(group) { return group.namedisplay });
                        _.each(ret.groups, function (group) {
                            self.$('.js-grouplist').append('<option value="' + group.id + '"></option>');
                            self.$('.js-grouplist option:last').html(group.namedisplay);
                        })
                    }
                });

                tinyMCE.init({
                    selector: '#mailhtml',
                    plugins: 'link textcolor code',
                    height: 300,
                    menubar: false,
                    elementpath: false,
                    toolbar: 'undo redo | bold italic underline | alignleft aligncenter alignright |  bullist numlist link | forecolor styleselect formatselect fontselect fontsizeselect | cut copy paste | code'
                });
            });

            return(p);
        }
    });

    Iznik.Views.ModTools.Pages.Support.Group = Iznik.View.extend({
       template: 'modtools_support_group'
    });

    Iznik.Views.ModTools.Alert = Iznik.View.extend({
        tagName: 'li',

        className: 'row',

        template: 'modtools_support_alert',

        events: {
            'click .js-showstats': 'showStats',
            'click .js-showbody': 'showBody'
        },

        showStats: function() {
            var self = this;

            // Get up to date stats.
            var mod = new Iznik.Models.Alert({
                id: this.model.get('id')
            });
            mod.fetch().then(function() {
                var v = new Iznik.Views.ModTools.Alert.Stats({
                    model: mod
                });
                v.render();
            })
        },

        showBody: function() {
            var self = this;

            var mod = new Iznik.Models.Alert({
                id: this.model.get('id')
            });
            mod.fetch().then(function() {
                var v = new Iznik.Views.ModTools.Alert.Body({
                    model: mod
                });
                v.render();
            })
        },

        render: function() {
            var p = Iznik.View.prototype.render.call(this);
            p.then(function(self) {
                var mom = new moment(self.model.get('created'));
                self.$('.js-created').html(mom.format('MMMM Do YYYY, h:mm:ssa'));
                if (self.model.get('complete')) {
                    var mom = new moment(self.model.get('complete'));
                    self.$('.js-complete').html(mom.format('MMMM Do YYYY, h:mm:ssa'));
                }
            })

            return(p);
        }
    });

    Iznik.Views.ModTools.Alert.Stats = Iznik.Views.Modal.extend({
        template: 'modtools_support_alertstats',

        render: function() {
            var self = this;

            function apiLoaded() {
                // Defer so that it's in the DOM - google stuff doesn't work well otherwise.
                _.defer(function () {

                    var colors = [
                        'green',
                        'orange'
                    ];

                    var stats = self.model.get('stats');
                    var data;
                    console.log("Stats", stats);

                    // First the group chart - this shows what happened on a per-group basis.
                    var reached = 0;
                    var total = 0;
                    var unreached = 0;
                    _.each(stats.responses.groups, function(group) {
                        total++;
                        _.each(group.summary, function(result) {
                            if (result.rsp == 'Reached') {
                                reached ++;;
                            }
                        })
                    });

                    data = new google.visualization.DataTable();
                    data.addColumn('string', 'Result');
                    data.addColumn('number', 'Count');
                    data.addRows([
                        [ 'Reached', reached ],
                        [ 'No Response', total - reached ]
                    ]);

                    self.groupchart = new google.visualization.PieChart(self.$('.js-groups').get()[0]);
                    chartOptions = {
                        title: "Groups",
                        chartArea: {'width': '80%', 'height': '80%'},
                        colors: colors,
                        slices2: {
                            1: {offset: 0.2},
                            2: {offset: 0.2}
                        }
                    };

                    self.groupchart.draw(data, chartOptions);

                    // Now the volunteers chart - this shows what happened on a per-volunteer basis.
                    data = new google.visualization.DataTable();
                    data.addColumn('string', 'Result');
                    data.addColumn('number', 'Count');
                    data.addRows([
                        [ 'Reached', stats.responses.mods.reached ],
                        [ 'No Response', stats.responses.mods.none ]
                    ]);

                    self.volschart = new google.visualization.PieChart(self.$('.js-mods').get()[0]);
                    chartOptions = {
                        title: "Volunteers",
                        chartArea: {'width': '80%', 'height': '80%'},
                        colors: colors,
                        slices2: {
                            1: {offset: 0.2},
                            2: {offset: 0.2}
                        }
                    };

                    self.volschart.draw(data, chartOptions);

                    // Now the owner address chart.
                    data = new google.visualization.DataTable();
                    data.addColumn('string', 'Result');
                    data.addColumn('number', 'Count');
                    data.addRows([
                        [ 'Reached', stats.responses.owner.reached ],
                        [ 'No Response', stats.responses.owner.none ]
                    ]);

                    self.ownchart = new google.visualization.PieChart(self.$('.js-owner').get()[0]);
                    chartOptions = {
                        title: '-owner Address',
                        chartArea: {'width': '80%', 'height': '80%'},
                        colors: colors,
                        slices2: {
                            1: {offset: 0.2},
                            2: {offset: 0.2}
                        }
                    };

                    self.ownchart.draw(data, chartOptions);
                });
            }

            // We have to load the chart after the modal is shown, otherwise odd things happen on the second such
            // modal we open.
            $('body').one('shown.bs.modal', '#alertstats', function(){
                google.load('visualization', '1.0', {
                    'packages':['corechart', 'annotationchart'],
                    'callback': apiLoaded
                });
            });

            this.open(this.template);

            return(this);
        }
    });

    Iznik.Views.ModTools.Alert.Body = Iznik.Views.Modal.extend({
        template: 'modtools_support_alertbody'
    });

    // TODO This feels like an abuse of the memberships API just to use the search mechanism.  Should there be a user
    // search instead?
    Iznik.Views.ModTools.Member.SupportSearch = Iznik.View.Timeago.extend({
        template: 'modtools_support_member',

        events: {
            'click .js-logs': 'logs',
            'click .js-spammer': 'spammer',
            'click .js-purge': 'purge'
        },

        groups: [],

        logs: function() {
            var self = this;
            var mod = new Iznik.Models.ModTools.User({
                id: self.model.get('id')
            });

            mod.fetch().then(function() {
                var v = new Iznik.Views.ModTools.User.Logs({
                    model: mod
                });

                v.render();
            });
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

        purge: function() {
            var self = this;
            var v = new Iznik.Views.Confirm({
                model: self.model
            });
            v.template = 'modtools_members_purgeconfirm';

            self.listenToOnce(v, 'confirmed', function() {
                $.ajax({
                    url: API + 'user',
                    type: 'DELETE',
                    data: {
                        id: self.model.get('id')
                    }, success: function(ret) {
                        if (ret.ret == 0) {
                            self.$el.fadeOut('slow');
                        }
                    }
                });
            });

            v.render();
        },

        addMessage: function(message) {
            var self = this;

            // We only want to show messages on reuse groups
            if (message.group.type == 'Freegle' || message.group.type == 'Reuse') {
                self.$('.js-messagesnone').hide();
                var v = new Iznik.Views.ModTools.Member.SupportSearch.Message({
                    model: new Iznik.Model(message)
                });

                v.render().then(function() {
                    self.$('.js-messages').append(v.el);
                });
            }
        },

        addMessages: function() {
            var self = this;

            _.each(self.model.get('messagehistory'), function (message) {
                self.$('.js-messagesnone').hide();
                message.group = self.groups[message.groupid];
                self.addMessage(message);
            });
        },

        render: function () {
            var self = this;

            var p = Iznik.View.prototype.render.call(this);
            p.then(function(self) {
                if (Iznik.Session.isAdmin()) {
                    self.$('.js-adminonly').removeClass('hidden');
                }

                // Add any group memberships.
                self.$('.js-memberof').empty();

                var emails = self.model.get('emails');

                var remaining = emails;

                _.each(self.model.get('memberof'), function (group) {
                    _.each(emails, function(email) {
                        if (email.id == group.emailid) {
                            group.email = email.email;
                            remaining = _.without(remaining, _.findWhere(remaining, {
                                email: email.email
                            }));
                        }
                    });

                    self.$('.js-memberofnone').hide();
                    var mod = new Iznik.Model(group);
                    var v = new Iznik.Views.ModTools.Member.SupportSearch.MemberOf({
                        model: mod,
                        user: self.model
                    });

                    v.render().then(function (v) {
                        self.$('.js-memberof').append(v.el);
                        v.$el.find('.js-emailfrequency').val(group.emailfrequency);
                    });
                });

                self.$('.js-otheremailsdiv').hide();
                _.each(remaining, function(email) {
                    self.$('.js-otheremailsdiv').show();
                    self.$('.js-otheremails').append(email.email + '<br />');
                });

                self.$('.js-applied').empty();
                _.each(self.model.get('applied'), function (group) {
                    self.$('.js-appliednone').hide();
                    var mod = new Iznik.Model(group);
                    var v = new Iznik.Views.ModTools.Member.SupportSearch.Applied({
                        model: mod
                    });
                    v.render().then(function (v) {
                        self.$('.js-appliedto').append(v.el);
                    });
                });

                // Add any sessions.
                var sessions = self.model.get('sessions');
                console.log("Sessions", sessions);
                self.sessionCollection = new Iznik.Collection(sessions);
                console.log("Session collection", self.sessionCollection);

                if (self.sessionCollection.length == 0) {
                    self.$('.js-sessionsnone').show();
                } else {
                    self.$('.js-sessionsnone').hide();
                }

                self.sessionCollectionView = new Backbone.CollectionView({
                    el: self.$('.js-sessions'),
                    modelView: Iznik.Views.ModTools.Pages.Replay.Session,
                    collection: self.sessionCollection
                });

                self.sessionCollectionView.render();
                
                // Add any chats
                self.chatCollection = new Iznik.Collection(self.model.get('chatrooms'));
                self.chatCollection.each(function(chat) {
                    chat.set('myuserid', self.model.get('id'));
                });

                // Show most recent first.
                self.chatCollection.comparator = function(chat) {
                    return -(new Date(chat.get('lastdate'))).getTime();
                };
                self.chatCollection.sort();

                if (self.chatCollection.length == 0) {
                    self.$('.js-chatsnone').show();
                } else {
                    self.$('.js-chatsnone').hide();
                }

                self.chatCollectionView = new Backbone.CollectionView({
                    el: self.$('.js-chats'),
                    modelView: Iznik.Views.ModTools.Member.SupportSearch.Chat,
                    collection: self.chatCollection
                });

                self.chatCollectionView.render();

                self.$('.js-chats').showFirst({
                    controlTemplate: '<div><span class="badge">+[REST_COUNT] more</span>&nbsp;<a href="#" class="show-first-control">show</a></div>',
                    count: 5
                });

                // Add message history.  Annoyingly, we might have a groupid for a group which we are not a
                // member of at the moment, so we may need to fetch some.
                self.$('.js-messages').empty();
                self.$('.js-messagesnone').hide();

                _.each(self.model.get('memberof'), function (group) {
                    self.groups[group.id] = group.attributes;
                });

                var fetching = 0;
                var tofetch = [];
                _.each(self.model.get('messagehistory'), function (message) {
                    if (!self.groups[message.groupid] && tofetch.indexOf(message.groupid) === -1) {
                        tofetch.push(message.groupid);
                    }
                });

                _.each(tofetch, function(groupid) {
                    var group = new Iznik.Models.Group({
                        id: groupid
                    });

                    fetching++;
                    group.fetch().then(function() {
                        fetching--;
                        self.groups[group.get('id')] = group.attributes;

                        if (fetching == 0) {
                            self.addMessages();
                        }
                    });
                });

                if (fetching == 0) {
                    // Not waiting to get any groups - add now.
                    self.addMessages();
                }
                
                // Logins
                self.loginCollection = new Iznik.Collection(self.model.get('logins'));

                if (self.loginCollection.length == 0) {
                    self.$('.js-loginsnone').show();
                }  else {
                    self.$('.js-loginsnone').hide();
                }

                self.loginCollectionView = new Backbone.CollectionView({
                    el: self.$('.js-logins'),
                    modelView: Iznik.Views.ModTools.Member.SupportSearch.Login,
                    collection: self.loginCollection
                });

                self.loginCollectionView.render();
                
                // Membership history
                self.membershipHistoryCollection = new Iznik.Collection(self.model.get('membershiphistory'));

                self.membershipHistoryCollectionView = new Backbone.CollectionView({
                    el: self.$('.js-membershiphistory'),
                    modelView: Iznik.Views.ModTools.Member.SupportSearch.MembershipHistory,
                    collection: self.membershipHistoryCollection
                });

                self.membershipHistoryCollectionView.render();
            });

            return (p);
        }
    });

    Iznik.Views.ModTools.Member.SupportSearch.Chat = Iznik.View.Timeago.extend({
        template: 'modtools_support_chat',

        events: {
            'click .js-viewchat': 'view'
        },

        view: function() {
            var self = this;

            var chat = new Iznik.Models.Chat.Room({
                id: self.model.get('id')
            });

            chat.fetch().then(function() {
                var v = new Iznik.Views.Chat.Modal({
                    model: chat
                });

                v.render();
            });
        }
    });

    Iznik.Views.ModTools.Member.SupportSearch.MemberOf = Iznik.View.extend({
        template: 'modtools_support_memberof',

        events: {
            'click .js-remove': 'remove'
        },

        remove: function() {
            var self = this;

            if (self.options.user.get('systemrole') == 'User') {
                var v = new Iznik.Views.Confirm({
                    model: self.options.user
                });
                v.template = 'modtools_members_removeconfirm';

                self.listenToOnce(v, 'confirmed', function() {
                    $.ajax({
                        url: API + 'memberships',
                        type: 'DELETE',
                        data: {
                            userid: self.options.user.get('id'),
                            groupid: self.model.get('id')
                        }, success: function(ret) {
                            if (ret.ret == 0) {
                                self.$el.fadeOut('slow');
                                self.options.user.trigger('removed');
                            }
                        }
                    });
                });

                v.render();
            }
        },

        render: function() {
            var self = this;
            var p = Iznik.View.prototype.render.call(self);
            p.then(function() {
                var usersite = $('meta[name=iznikusersite]').attr("content");
                var group = self.model.get('onhere') ? ('https://' + usersite + '/explore/' + self.model.get('nameshort')) : ('https://groups.yahoo.com/group/' + self.model.get('nameshort'));
                self.$('.js-group').attr('href', group);

                var m = new moment(self.model.get('added'));
                self.$('.js-date').html(m.format('DD-MMM-YYYY'));

                self.$('.js-eventsenabled').val(self.model.get('eventsenabled'));
                self.$('.js-yahoodelivery').val(self.model.get('yahooDeliveryType'));

                self.$('.js-ourpostingstatus').val(self.model.get('ourpostingstatus'));
                self.$('.js-role').val(self.model.get('role'));

                self.$('.datepicker').datepicker({
                    format: 'D, dd MM yyyy',
                    startDate: '0d',
                    endDate: '+30d'
                });

                var onholiday = self.model.get('onholidaytill');

                self.$(".js-switch").bootstrapSwitch({
                    onText: 'Paused',
                    offText: 'On',
                    state: onholiday != undefined
                });

                if (onholiday && onholiday != undefined && onholiday != "1970-01-01T00:00:00Z") {
                    self.$('.js-onholidaytill').show();
                    self.$('.datepicker').datepicker('setUTCDate', new Date(onholiday));
                } else {
                    self.$('.js-onholidaytill').hide();
                }

                self.waitDOM(self, function() {
                    self.$('select').selectpicker();
                });

                self.delegateEvents();
            });

            return(p);
        }
    });

    Iznik.Views.ModTools.Member.SupportSearch.Message = Iznik.View.extend({
        template: 'modtools_support_message',

        render: function() {
            var self = this;
            var p = Iznik.View.prototype.render.call(self);
            p.then(function() {
                var mom = new moment(self.model.get('arrival'));
                self.$('.js-date').html(mom.format('DD-MMM-YYYY hh:mm:a'));
            });

            return(p);
        }
    });

    Iznik.Views.ModTools.Member.SupportSearch.MembershipHistory = Iznik.View.Timeago.extend({
        template: 'modtools_support_membershiphistory'
    });

    Iznik.Views.ModTools.Member.SupportSearch.Applied = Iznik.Views.ModTools.Member.Applied.extend({
        template: 'modtools_support_appliedto'
    });

    Iznik.Views.ModTools.Member.SupportSearch.Login = Iznik.View.Timeago.extend({
        template: 'modtools_support_login',

        events: {
            'click .js-resetpw': 'reset'
        },

        reset: function() {
            var self = this;
            var pw = self.$('.js-pw').val();
            $.ajax({
                url: API + 'user',
                type: 'PATCH',
                data: {
                    id: self.model.get('userid'),
                    password: pw
                }, success: function(ret) {
                    if (ret.ret == 0) {
                        self.$('.js-text').hide();
                        self.$('.js-ok').show();
                    }
                }
            })
        }
    });

    Iznik.Views.ModTools.Message.SupportSearchResult = Iznik.Views.ModTools.Message.Approved.extend({
    });

    Iznik.Views.ModTools.Member.Session = Iznik.View.Timeago.extend({
        template: 'modtools_support_session',
        
        events: {
            'click .js-play': 'play'
        },
        
        play: function() {
            var width = window.innerWidth * 0.66 ;
            var height = width * window.innerHeight / window.innerWidth ;
            window.open('/modtools/replay/' + this.model.get('sessionid'), 'Session Replay', 'width=' + width + ', height=' + height + ', top=' + ((window.innerHeight - height) / 2) + ', left=' + ((window.innerWidth - width) / 2));
        }
    });

    Iznik.Views.ModTools.Pages.Support.GroupAdded = Iznik.Views.Modal.extend({
        template: 'modtools_support_groupadded'
    });
});