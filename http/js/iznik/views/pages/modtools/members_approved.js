define([
    'jquery',
    'underscore',
    'backbone',
    'moment',
    'FileSaver',
    'iznik/base',
    'iznik/views/pages/pages'
], function($, _, Backbone, moment, saveAs, Iznik) {
    Iznik.Views.ModTools.Pages.ApprovedMembers = Iznik.Views.Infinite.extend({
        modtools: true,

        template: "modtools_members_approved_main",

        events: function () {
            return _.extend({}, Iznik.Views.Page.prototype.events, {
                'click .js-search': 'search',
                'keyup .js-searchterm': 'keyup',
                'click .js-sync': 'sync',
                'click .js-export': 'export',
                'click .js-exportyahoo': 'exportYahoo'
            });
        },

        keyup: function (e) {
            // Search on enter.
            if (e.which == 13) {
                this.$('.js-search').click();
            }
        },

        sync: function () {
            var group = Iznik.Session.getGroup(this.selected)
            IznikPlugin.collection.add(new Iznik.Models.Plugin.Work({
                id: group.get('nameshort') + '.SyncMessages.Approved',
                subview: new Iznik.Views.Plugin.Yahoo.SyncMembers.Approved({
                    model: group
                }),
                bulk: true
            }));
        },

        exportChunk: function () {
            // We don't use the collection fetch because we're not interested in maintaining a collection, and it chews up
            // a lot of memory.
            var self = this;
            $.ajax({
                type: 'GET',
                url: API + 'memberships/' + self.selected,
                context: self,
                data: {
                    limit: 1000,
                    context: self.exportContext ? self.exportContext : null
                },
                success: function (ret) {
                    var self = this;
                    self.exportContext = ret.context;

                    if (ret.members.length > 0) {
                        // We returned some - add them to the list.
                        _.each(ret.members, function (member) {
                            var otheremails = [];
                            _.each(member.otheremails, function (email) {
                                if (email.email != member.email) {
                                    otheremails.push(email.email);
                                }
                            });

                            self.exportList.push([
                                member.id,
                                member.displayname,
                                member.yahooid,
                                member.email,
                                member.joined,
                                member.role,
                                otheremails.join(', '),
                                member.yahooDeliveryType,
                                member.yahooPostingStatus,
                                JSON.stringify(member.settings, null, 0)
                            ]);
                        });

                        self.exportChunk.call(self);
                    } else {
                        // We got them all.
                        // Loop through converting each to CSV.
                        var csv = new csvWriter();
                        csv.del = ',';
                        csv.enc = '"';
                        var csvstr = csv.arrayToCSV(self.exportList);

                        self.exportWait.close();
                        var blob = new Blob([csvstr], {type: "text/csv;charset=utf-8"});
                        saveAs(blob, "members.csv");
                    }
                }
            })
        },

        export: function () {
            // Get all the members.  Slow.
            if (this.selected > 0) {
                var v = new Iznik.Views.PleaseWait({
                    timeout: 1
                });
                v.template = 'modtools_members_approved_exportwait';
                v.render();
                this.exportWait = v;
                this.exportList = [['Unique ID', 'Display Name', 'Yahoo ID', 'Email on Group', 'Joined', 'Role on Group', 'Other emails', 'Yahoo Delivery Type', 'Yahoo Posting Status', 'Settings on Group']];
                this.exportContext = null;
                this.exportChunk();
            }
        },

        exportYahoo: function () {
            var self = this;

            // Get all the members from Yahoo.  Slow.
            if (this.selected > 0) {
                self.wait = new Iznik.Views.PleaseWait({
                    timeout: 1
                });
                self.wait.template = 'modtools_members_approved_exportwait';
                self.wait.render();

                $.ajax({
                    type: 'GET',
                    url: API + 'memberships',
                    data: {
                        groupid: self.selected,
                        action: 'exportyahoo'
                    },
                    success: function (ret) {
                        self.wait.close();
                        if (ret.ret == 0) {
                            var members = ret.members;
                            var exp = [['Joined', 'Yahoo Id', 'Yahoo Alias', 'Email', 'Yahoo User Id', 'Delivery Type', 'Posting Status']];
                            _.each(members, function (member) {
                                var date = new moment(member['date']);
                                exp.push([date.format(), member['yahooid'], member['yahooAlias'], member['email'], member['yahooUserId'], member['yahooDeliveryType'], member['yahooPostingStatus']]);
                            });

                            var csv = new csvWriter();
                            csv.del = ',';
                            csv.enc = '';
                            var csvstr = csv.arrayToCSV(exp);
                            var blob = new Blob([csvstr], {type: "text/csv;charset=utf-8"});
                            saveAs(blob, "members.csv");
                        }
                    }, error: function () {
                        self.wait.close();
                    }
                })
            }
        },

        search: function () {
            var term = this.$('.js-searchterm').val();

            if (term != '') {
                Router.navigate('/modtools/members/approved/' + encodeURIComponent(term), true);
            } else {
                Router.navigate('/modtools/members/approved', true);
            }
        },

        render: function () {
            var self = this;

            Iznik.Views.Page.prototype.render.call(this);

            var v = new Iznik.Views.Help.Box();
            v.template = 'modtools_members_approved_help';
            this.$('.js-help').html(v.render().el);

            self.groupSelect = new Iznik.Views.Group.Select({
                systemWide: false,
                all: false,
                mod: true,
                counts: ['approvedmembers', 'approvedmembersother'],
                id: 'approvedGroupSelect'
            });

            self.listenTo(self.groupSelect, 'selected', function (selected) {
                // Change the group selected.
                self.selected = selected;

                // We haven't fetched anything for this group yet.
                self.lastFetched = null;
                self.context = null;

                // CollectionView handles adding/removing/sorting for us.
                self.collectionView = new Backbone.CollectionView({
                    el: self.$('.js-list'),
                    modelView: Iznik.Views.ModTools.Member.Approved,
                    modelViewOptions: {
                        collection: self.collection,
                        page: self
                    },
                    collection: self.collection
                });

                self.collectionView.render();

                // The type of collection we're using depends on whether we're searching.  It controls how we fetch.
                if (self.options.search) {
                    self.collection = new Iznik.Collections.Members.Search(null, {
                        groupid: self.selected,
                        group: Iznik.Session.get('groups').get(self.selected),
                        collection: 'Approved',
                        search: self.options.search
                    });

                    self.$('.js-searchterm').val(self.options.search);
                } else {
                    self.collection = new Iznik.Collections.Members(null, {
                        groupid: self.selected,
                        group: Iznik.Session.get('groups').get(self.selected),
                        collection: 'Approved'
                    });
                }

                // CollectionView handles adding/removing/sorting for us.
                self.collectionView = new Backbone.CollectionView({
                    el: self.$('.js-list'),
                    modelView: Iznik.Views.ModTools.Member.Approved,
                    modelViewOptions: {
                        collection: self.collection,
                        page: self
                    },
                    collection: self.collection
                });

                self.collectionView.render();
                self.fetch();
            });

            // Render after the listen to as they are called during render.
            self.$('.js-groupselect').html(self.groupSelect.render().el);

            // If we detect that the pending counts have changed on the server, refetch the members so that we add/remove
            // appropriately.  Re-rendering the select will trigger a selected event which will re-fetch and render.
            this.listenTo(Iznik.Session, 'approvedmemberscountschanged', _.bind(this.groupSelect.render, this.groupSelect));
            this.listenTo(Iznik.Session, 'approvedmembersothercountschanged', _.bind(this.groupSelect.render, this.groupSelect));

            // We seem to need to redelegate
            self.delegateEvents();
        }
    });

    Iznik.Views.ModTools.Member.Approved = Iznik.Views.ModTools.Member.extend({
        template: 'modtools_members_approved_member',

        events: {
            'click .js-rarelyused': 'rarelyUsed'
        },

        render: function () {
            var self = this;

            self.$el.html(window.template(self.template)(self.model.toJSON2()));
            var now = new moment();
            var mom = new moment(this.model.get('joined'));
            var age = now.diff(mom, 'days');
            this.$('.js-joined').html(mom.format('llll'));

            if (age <= 31) {
                // Flag recent joiners.
                this.$('.js-joined').addClass('error');
            }

            self.addOtherInfo();

            // Get the group from the session
            var group = Iznik.Session.getGroup(self.model.get('groupid'));

            // Our user.  In memberships the id is that of the member, so we need to get the userid.
            var mod = self.model.clone();
            mod.set('id', self.model.get('userid'));
            var v = new Iznik.Views.ModTools.User({
                model: mod
            });

            self.$('.js-user').html(v.render().el);

            // Delay getting the Yahoo info slightly to improve apparent render speed.
            _.delay(function () {
                // The Yahoo part of the user
                var mod = IznikYahooUsers.findUser({
                    email: self.model.get('email'),
                    group: group.get('nameshort'),
                    groupid: group.get('id')
                });

                mod.fetch().then(function () {
                    // We don't want to show the Yahoo joined date because we have our own.
                    mod.unset('date');
                    var v = new Iznik.Views.ModTools.Yahoo.User({
                        model: mod
                    });
                    self.$('.js-yahoo').append(v.render().el);
                });
            }, 200);

            // Add the default standard actions.
            var configs = Iznik.Session.get('configs');
            var sessgroup = Iznik.Session.get('groups').get(group.id);
            var config = configs.get(sessgroup.get('configid'));

            // Save off the groups in the member ready for the standard message
            // TODO Hacky.  Should we split the StdMessage.Button code into one for members and one for messages?
            self.model.set('groups', [group.attributes]);
            self.model.set('fromname', self.model.get('displayname'));
            self.model.set('fromaddr', self.model.get('email'));
            self.model.set('fromuser', self.model);

            self.$('.js-stdmsgs').append(new Iznik.Views.ModTools.StdMessage.Button({
                model: new Iznik.Model({
                    title: 'Mail',
                    action: 'Leave Approved Member',
                    member: self.model,
                    config: config
                })
            }).render().el);

            if (config) {
                // Add the other standard messages, in the order requested.
                var sortmsgs = orderedMessages(config.get('stdmsgs'), config.get('messageorder'));
                var anyrare = false;

                _.each(sortmsgs, function (stdmsg) {
                    if (_.contains(['Leave Approved Member', 'Delete Approved Member'], stdmsg.action)) {
                        stdmsg.groups = [group];
                        stdmsg.member = self.model;
                        var v = new Iznik.Views.ModTools.StdMessage.Button({
                            model: new Iznik.Models.ModConfig.StdMessage(stdmsg),
                            config: config
                        });

                        var el = v.render().el;
                        self.$('.js-stdmsgs').append(el);

                        if (stdmsg.rarelyused) {
                            anyrare = true;
                            $(el).hide();
                        }
                    }
                });

                if (!anyrare) {
                    self.$('.js-rarelyholder').hide();
                }
            }

            this.$('.timeago').timeago();

            this.listenToOnce(self.model, 'removed', function () {
                self.$el.fadeOut('slow');
            });

            return (this);
        }
    });
});