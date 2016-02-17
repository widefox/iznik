Iznik.Views.ModTools.Pages.Support = Iznik.Views.Page.extend({
    modtools: true,

    template: "modtools_support_main",

    events: {
        'click .js-searchuser': 'searchUser'
    },

    searchUser: function() {
        var self = this;

        self.$('.js-loading').addClass('hidden');

        self.collection = new Iznik.Collections.Members.Search(null, {
            collection: 'Approved',
            search: this.$('.js-searchuserinp').val()
        });

        self.collectionView = new Backbone.CollectionView( {
            el : self.$('.js-searchuserres'),
            modelView : Iznik.Views.ModTools.Member.SupportSearch,
            collection: self.collection
        } );

        var v = new Iznik.Views.PleaseWait({
            timeout: 1
        });

        self.collectionView.render();
        this.collection.fetch({
            remove: true,
            data: {
                limit: 100
            },
            success: function(collection, response, options) {
                v.close();

                if (collection.length == 0) {
                    self.$('.js-none').fadeIn('slow');
                }
            }
        });
    },

    render: function() {
        var self = this;
        Iznik.Views.Page.prototype.render.call(this);
    }
});

// TODO This feels like an abuse of the memberships API just to use the search mechanism.  Should there be a user
// search instead?
Iznik.Views.ModTools.Member.SupportSearch = IznikView.extend({
    template: 'modtools_support_member',

    events: {
    },

    render: function() {
        var self = this;

        self.$el.html(window.template(self.template)(self.model.toJSON2()));

        // Our user
        var v = new Iznik.Views.ModTools.User({
            model: self.model
        });

        self.$('.js-user').html(v.render().el);

        // We are not in the context of a specific group here, so the general remove/ban buttons don't make sense.
        self.$('.js-ban, .js-remove').closest('li').remove();

        // Add any emails
        self.$('.js-otheremails').empty();
        _.each(self.model.get('otheremails'), function(email) {
            if (email.preferred) {
                self.$('.js-email').append(email.email);
            } else {
                var mod = new IznikModel(email);
                var v = new Iznik.Views.ModTools.Message.OtherEmail({
                    model: mod
                });
                self.$('.js-otheremails').append(v.render().el);
            }
        });

        // Add any group memberships.
        self.$('.js-memberof').empty();
        _.each(self.model.get('memberof'), function(group) {
            var mod = new IznikModel(group);
            var v = new Iznik.Views.ModTools.Member.Of({
                model: mod
            });
            self.$('.js-memberof').append(v.render().el);
        });

        self.$('.js-applied').empty();
        _.each(self.model.get('applied'), function(group) {
            var mod = new IznikModel(group);
            var v = new Iznik.Views.ModTools.Member.Applied({
                model: mod
            });
            self.$('.js-applied').append(v.render().el);
        });

        // Add the default standard actions.
        self.model.set('fromname', self.model.get('displayname'));
        self.model.set('fromaddr', self.model.get('email'));
        self.model.set('fromuser', self.model);

        self.$('.js-stdmsgs').append(new Iznik.Views.ModTools.StdMessage.Button({
            model: new IznikModel({
                title: 'Mail',
                action: 'Leave Approved Member',
                member: self.model
            })
        }).render().el);

        this.$('.timeago').timeago();

        // If we delete this member then the view should go.
        this.listenToOnce(self.model, 'removed', function() {
            self.$el.fadeOut('slow', function() {
                self.remove();
            });
        });

        return(this);
    }
});