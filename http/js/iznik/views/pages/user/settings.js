define([
    'jquery',
    'underscore',
    'backbone',
    'iznik/base',
    'iznik/views/pages/pages',
    'iznik/views/pages/user/pages',
    'iznik/views/help',
    'bootstrap-switch',
    'bootstrap-datepicker'
], function($, _, Backbone, Iznik) {
    // We extend WhereAmI to get the location-choosing code.
    Iznik.Views.User.Pages.Settings = Iznik.Views.User.Pages.WhereAmI.extend({
        template: "user_settings_main",
        
        getLocation: function() {
            navigator.geolocation.getCurrentPosition(_.bind(this.gotLocation, this));
        },

        events: {
            'switchChange.bootstrapSwitch .js-onholiday': 'onholiday',
            'keyup .js-name': 'nameChange',
            'keyup .js-email': 'emailChange'
        },

        onholiday: function() {
            if (this.$('.js-onholiday').prop('checked')) {
                this.$('.js-onholidaytill').show();
                this.$('.js-until').show();
                this.$('.js-onholidaytill').datepicker('update', new Date());
            } else {
                this.$('.js-onholidaytill').val('1970-01-01T00:00:00Z');
                this.$('.js-onholidaytill').hide();
                this.$('.js-until').hide();
            }
        },

        nameChange: function(e) {
            var self = this;
            self.$('.js-name').removeClass('error-border');
            if (e.which === 13) {
                var name = this.$('.js-name').val();
                if (name.length > 0) {
                    var me = Iznik.Session.get('me');
                    me.displayname = name;
                    Iznik.Session.set('me', me);
                    try {
                        localStorage.removeItem('session');
                    } catch (e) {};

                    Iznik.Session.save({
                        id: me.id,
                        displayname: name
                    }, {
                        patch: true
                    }).then(function() {
                        self.$('.js-nameok').fadeIn();
                    });
                } else {
                    self.$('.js-name').addClass('error-border');
                    self.$('.js-name').focus();
                }
            }
        },

        emailChange: function(e) {
            self.$('.js-email').removeClass('error-border');
            if (e.which === 13) {
                var email= this.$('.js-email').val();
                if (email.length > 0 && isValidEmailAddress(email)) {
                    var me = Iznik.Session.get('me');
                    me.email = email;
                    Iznik.Session.set('me', me);
                    try {
                        localStorage.removeItem('session');
                    } catch (e) {};

                    Iznik.Session.save({
                        id: me.id,
                        email: email
                    }, {
                        patch: true
                    }).then(function() {
                        self.$('.js-emailok').fadeIn();
                    });
                } else {
                    self.$('.js-email').addClass('error-border');
                    self.$('.js-email').focus();
                }
            }
        },

        render: function () {
            var self = this;

            var p = Iznik.Views.User.Pages.WhereAmI.prototype.render.call(this, {
                model: new Iznik.Model(Iznik.Session.get('settings'))
            });

            p.then(function() {
                var v = new Iznik.Views.Help.Box();
                v.template = 'user_settings_help';
                v.render().then(function(v) {
                    self.$('.js-help').html(v.el);
                });

                self.$(".js-switch").bootstrapSwitch({
                    onText: 'Mails Paused',
                    offText: 'Mails On'
                });
                self.$('abbr.timeago').timeago();
                self.$('.datepicker').datepicker({
                    format: 'D, dd MM yyyy'
                });

                var me = Iznik.Session.get('me');
                self.$('.js-name').val(me.displayname)
                self.$('.js-email').val(me.email)

                var onholiday = Iznik.Session.getSetting('onholidaytill');
                self.$('.js-onholiday').prop('checked', onholiday != undefined);
                self.onholiday();

                self.groupscoll = Iznik.Session.get('groups');
                self.collectionView = new Backbone.CollectionView({
                    el: self.$('.js-mailgroups'),
                    modelView: Iznik.Views.User.Settings.Group,
                    collection: self.groupscoll,
                    visibleModelsFilter: function(group) {
                        // Only show Freegle groups in the UI.
                        return(group.get('type') == 'Freegle')
                    }
                });

                self.collectionView.render();
            });

            return (p);
        }
    });

    Iznik.Views.User.Settings.Group = Iznik.View.extend({
        template: "user_settings_group",

        render: function() {
            var self = this;
            Iznik.View.prototype.render.call(this).then(function() {
                var freq = parseInt(self.model.get('mysettings').emailfrequency);
                self.$('.js-frequency').val(freq);
            })
        }
    });
});