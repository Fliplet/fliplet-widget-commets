// TODO: Change Entry Id for entity to be a GUID
// TODO Implement tinyMce
// TODO Implement mention users
Fliplet.Widget.instance('comments', function(widgetData) {
  const COMMENTS = this;
  const COMMENTS_INSTANCE_ID = COMMENTS.id;
  const DS_USERS = widgetData.userDataSource;
  const QUERY = Fliplet.Navigate.query;
  const EMAIL_COLUMN = widgetData.columnEmail;
  const USER_PHOTO_COLUMN = widgetData.columnUserPhoto;
  const FLAGGED_EMAILS = widgetData.flaggedEmails;
  const FLAGGED_MAIL_CONTENT = widgetData.flaggedMailContent;
  const USER_NAMES = widgetData.userNames;
  const COMMENTS_DS_ID = widgetData.commentsDataSourceId;
  const MODE_INTERACT = Fliplet.Env.get('mode') === 'interact';

  const EMAILS_TO_NOTIFY_FLAGGED_COMMENT = !FLAGGED_EMAILS
    ? []
    : FLAGGED_EMAILS.split(',')
      .map((el) => el.trim())
      .filter((el) => RegExp(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/).test(el));
  let loggedUser = null;


  Fliplet.Widget.findParents({
    instanceId: COMMENTS_INSTANCE_ID
  }).then((widgets) => {
    let dynamicContainer = null;
    let recordContainer = null;

    widgets.forEach((widget) => {
      if (widget.package === 'com.fliplet.dynamic-container') {
        dynamicContainer = widget;
      } else if (widget.package === 'com.fliplet.record-container') {
        recordContainer = widget;
      }
    });

    if (!dynamicContainer || !dynamicContainer.dataSourceId) {
      showContent('not-configured');

      return errorMessageStructureNotValid($(COMMENTS.$el), 'This component needs to be placed inside a Data container and select a data source');
    } else if (!recordContainer) {
      showContent('not-configured');

      return errorMessageStructureNotValid($(COMMENTS.$el), 'This component needs to be placed inside a Single record container');
    }

    if (!DS_USERS) {
      if (MODE_INTERACT) {
        showContent('not-configured');
      } else {
        showContent('configured');
      }

      return showToastMessage('Please select Data source');
    }

    if (!EMAIL_COLUMN) {
      if (MODE_INTERACT) {
        showContent('not-configured');
      } else {
        showContent('configured');
      }

      return showToastMessage('Please select column for the email');
    }

    if (!USER_NAMES || !USER_NAMES.length) {
      if (MODE_INTERACT) {
        showContent('not-configured');
      } else {
        showContent('configured');
      }

      return showToastMessage('Please select user names');
    }

    if (!QUERY.dataSourceEntryId) {
      if (MODE_INTERACT) {
        showContent('not-configured');
      } else {
        showContent('configured');
      }

      return showToastMessage('No data source entry ID provided');
    }

    if (!MODE_INTERACT) {
      showContent('configured');
      Fliplet.Widget.initializeChildren(this.$el, this);
      loadComments();
    } else {
      showContent('configured-interact');
    }
  });

  // TODO remove when product provide solution
  function errorMessageStructureNotValid($element, message) {
    $element.addClass('component-error-before-xxx');
    Fliplet.UI.Toast(message);
  }

  function showContent(mode) {
    $('.configured').toggle(mode === 'configured');
    $('.not-configured').toggle(mode === 'not-configured');
    $('.configured-interact').toggle(mode === 'configured-interact');
    $('[name="comments"]').removeClass('hidden');
  }

  function showToastProgress(message = 'Processing') {
    Fliplet.UI.Toast({
      message,
      position: 'center',
      backdrop: true,
      tapToDismiss: false,
      duration: false
    });
  }

  function loadComments() {
    showToastProgress('Loading comments...');
    initVue();
  }

  function showToastMessage(message) {
    return Fliplet.UI.Toast(message);
  }

  function initVue() {
    Fliplet().then(() => {
      new Vue({
        el: '#app-comments',
        data: {
          commentInput: '',
          commentState: null,
          message: 'Hello, Vue!',
          comments: []
        },
        computed: {
          commentsData() {
            return this.comments;
          }
        },
        methods: {
          clearState() {
            this.commentState = null;
            this.commentInput = '';
          },
          closeToastProgress() {
            Fliplet.UI.Toast.dismiss();
          },
          checkCommentState(comment, state) {
            if (state === 'active') {
              return this.commentState && this.commentState.comment.id === comment.id;
            } else if (state === 'reply') {
              return this.commentState && this.commentState.action === 'reply' && this.commentState.comment.id === comment.id;
            } else if (state === 'edit') {
              return this.commentState && this.commentState.action === 'edit' && this.commentState.comment.id === comment.id;
            }

            return false;
          },
          flagComment(comment) {
            showToastProgress('Flagging the comment...');
            comment.data.flagged = true;

            Fliplet.DataSources.connect(COMMENTS_DS_ID)
              .then(connection => {
                return connection.update(comment.id, {
                  Flagged: comment.data.flagged,
                  GUID: comment.data.GUID
                });
              })
              .then(() => {
                if (EMAILS_TO_NOTIFY_FLAGGED_COMMENT.length) {
                  return this
                    .getExistingEmailsToNotifyAboutFlag()
                    .then(existingEmails => {
                      let emails = existingEmails.map((user) => {
                        let adminName = '';

                        if (USER_NAMES.length === 1) {
                          adminName = user.data[USER_NAMES[0]];
                        } else if (USER_NAMES.length === 2) {
                          adminName = `${user.data[USER_NAMES[0]]} ${user.data[USER_NAMES[1]]}`;
                        }

                        return {
                          options: {
                            to: [
                              { email: user.data[EMAIL_COLUMN], name: adminName, type: 'to' }
                            ],
                            html: FLAGGED_MAIL_CONTENT,
                            subject: 'Comment flagged'
                          // from_name: 'Example Name'
                          }
                        };
                      });

                      return Fliplet.Communicate.batchSendEmail(emails).then(() => {
                        this.closeToastProgress();
                        setTimeout(() => {
                          comment.data.flagged = false;
                        }, 2000);
                      });
                    });
                }
              });
          },
          toggleThreads(comment) {
            comment.showThreads = !comment.showThreads;
          },
          getExistingEmailsToNotifyAboutFlag() {
            return Fliplet.DataSources.connect(DS_USERS)
              .then(connection =>
                connection.find({
                  where: { [EMAIL_COLUMN]: { $in: EMAILS_TO_NOTIFY_FLAGGED_COMMENT } },
                  attributes: [EMAIL_COLUMN, ...USER_NAMES]
                })
              )
              .then((records) => records);
          },
          getUserData(userEmails) {
            return Fliplet.DataSources.connect(DS_USERS)
              .then(connection =>
                connection.find({
                  where: { [EMAIL_COLUMN]: { $in: userEmails } },
                  attributes: [
                    EMAIL_COLUMN,
                    ...USER_NAMES,
                    USER_PHOTO_COLUMN
                  ]
                })
              )
              .then(records => records);
          },
          getComments() {
            let entryId = QUERY.dataSourceEntryId;

            return Fliplet.DataSources.connect(COMMENTS_DS_ID).then(
              connection => {
                return connection
                  .find({ where: { 'Entry Id': entryId } })
                  .then(records => {
                    let userEmails = records.map(
                      (el) => el.data['Author Email']
                    );

                    return this.getUserData(userEmails).then(users => {
                      let comments = [];
                      let threads = [];

                      records.forEach((el) => {
                        let currentUser = users.find(
                          (user) =>
                            user.data[EMAIL_COLUMN] === el.data['Author Email']
                        );

                        el.data.userFullName = this.getUserFullName(currentUser.data);
                        el.data.userInitials = this.getUserInitials(currentUser.data);
                        el.data.userAvatar = currentUser.data[USER_PHOTO_COLUMN]
                          ? Fliplet.Media.authenticate(
                            currentUser.data[USER_PHOTO_COLUMN]
                          )
                          : null;
                        el.data.flagged = false;
                        el.data.openDropdown = false;

                        if (el.data['Comment GUID']) {
                          threads.push(el);
                        } else {
                          comments.push(el);
                        }
                      });

                      this.comments = comments.map((el) => {
                        el.showThreads = false;
                        el.threads = threads.filter(
                          (thread) =>
                            thread.data['Comment GUID'] === el.data['GUID']
                        );

                        return el;
                      });

                      this.closeToastProgress();
                    });
                  });
              }
            );
          },
          getUserFullName(userData) {
            let userFullName = '';

            if (USER_NAMES.length === 1) {
              userFullName = userData[USER_NAMES[0]];
            } else if (USER_NAMES.length === 2) {
              userFullName = `${userData[USER_NAMES[0]]} ${userData[USER_NAMES[1]]}`;
            }

            return userFullName;
          },
          getUserInitials(userData) {
            let userInitials = '';

            if (USER_NAMES.length === 1) {
              userInitials = (
                userData[USER_NAMES[0]] || ''
              )
                .split(' ')
                .map((name) => name[0])
                .join('');
            } else if (USER_NAMES.length === 2) {
              userInitials = USER_NAMES.map((el) => userData[el] ? userData[el][0] : '').join('');
            }

            return userInitials;
          },
          isLikedByLoginUser(likes) {
            return likes.includes(loggedUser.Email);
          },
          isLoggedUserOwnerOfComment(comment) {
            return comment.data['Author Email'] === loggedUser.Email;
          },
          getTimeFromTimestamp: function(timestamp) {
            return moment(timestamp).format('HH:mm');
          },
          getDateFromTimestamp: function(timestamp) {
            return moment(timestamp).format('MM/DD/YYYY');
          },
          manageLike(comment) {
            if (this.isLikedByLoginUser(comment.data.Likes)) {
              comment.data.Likes = comment.data.Likes.filter(
                (el) => el !== loggedUser[EMAIL_COLUMN]
              );
            } else {
              comment.data.Likes.push(loggedUser[EMAIL_COLUMN]);
            }

            return Fliplet.DataSources.connect(COMMENTS_DS_ID).then(
              connection => {
                return connection.update(comment.id, {
                  Likes: comment.data.Likes,
                  GUID: comment.data.GUID
                });
              }
            );
          },
          clearCommentState() {
            this.commentState = null;
            this.commentInput = '';
          },
          prepareComment(comment, action) {
            this.commentState = {
              comment,
              action
            };

            if (action === 'edit') {
              this.commentInput = comment.data.Message;
            }
          },
          manageComment() {
            if (this.commentInput) {
              if (
                !this.commentState
                || this.commentState.action === 'reply'
              ) {
                showToastProgress('Adding comment...');
                Fliplet.DataSources.connect(COMMENTS_DS_ID).then(connection => {
                  let toInsert = {
                    Message: this.commentInput,
                    'Author Email': loggedUser[EMAIL_COLUMN],
                    Timestamp: new Date().toISOString(),
                    'Entry Id': QUERY.dataSourceEntryId,
                    Likes: []
                  };

                  if (
                    this.commentState
                    && this.commentState.action === 'reply'
                  ) {
                    toInsert['Comment GUID']
                      = this.commentState.comment.data['GUID'];
                  }

                  return connection.insert(toInsert).then(record => {
                    record.data.userInitials = this.getUserInitials(loggedUser);
                    record.data.userFullName = this.getUserFullName(loggedUser);
                    record.data.flagged = false;
                    record.data.openDropdown = false;
                    record.showThreads = false;
                    record.threads = [];

                    if (
                      this.commentState
                      && this.commentState.action === 'reply'
                    ) {
                      this.comments = this.comments.map((el) => {
                        if (
                          el.data['GUID']
                          === this.commentState.comment.data['GUID']
                        ) {
                          el.threads.push(record);
                        }

                        return el;
                      });
                    } else {
                      this.comments.unshift(record);
                    }

                    this.closeToastProgress();
                    this.clearCommentState();
                  });
                });
              } else {
                showToastProgress('Updating comment...');
                Fliplet.DataSources.connect(COMMENTS_DS_ID).then(connection => {
                  return connection
                    .update(this.commentState.comment.id, {
                      Message: this.commentInput,
                      GUID: this.commentState.comment.data['GUID']
                    })
                    .then(() => {
                      this.comments = this.comments.map((el) => {
                        if (el.id === this.commentState.comment.id) {
                          el.data.Message = this.commentInput;
                        }

                        return el;
                      });

                      this.clearCommentState();
                      this.closeToastProgress();
                    });
                });
              }
            }
          },
          deleteComment(comment, isThread = false) {
            let message = 'Are you sure you want to delete this comment? Note that all the threads will be deleted as well.';

            if (isThread) {
              message = 'Are you sure you want to delete this thread?';
            }

            let options = {
              title: 'Delete comment?',
              message,
              labels: ['Agree', 'No'] // Native only (defaults to [OK,Cancel])
            };

            Fliplet.Navigate.confirm(options).then(result => {
              if (!result) {
                return Promise.reject(''); // Not confirmed!
              }

              showToastProgress('Deleting comment...');

              let deleteCommentPromise;

              if (isThread) {
                deleteCommentPromise = Fliplet.DataSources.connect(
                  COMMENTS_DS_ID
                ).then(connection => {
                  return connection.removeById(comment.id).then(() => {
                    this.comments = this.comments.map((el) => {
                      if (el.data['GUID'] === comment.data['Comment GUID']) {
                        el.threads = el.threads.filter(
                          (el) => el.id !== comment.id
                        );
                      }

                      return el;
                    });

                    this.closeToastProgress();
                  });
                });
              } else {
                deleteCommentPromise = Fliplet.DataSources.connect(
                  COMMENTS_DS_ID
                ).then(connection => {
                  return connection
                    .find({ where: { 'Comment GUID': comment.data.GUID } })
                    .then(records => { // All threads for the comment
                      return connection
                        .commit({
                          delete: records.map((el) => el.id),
                          append: true,
                          extend: true
                        })
                        .then(() => {
                          return connection
                            .removeById(comment.id)
                            .then(() => {
                              this.comments = this.comments.filter(
                                (el) => el.id !== comment.id
                              );
                              this.closeToastProgress();
                            });
                        });
                    });
                });
              }

              return deleteCommentPromise;
            });
          }
        },
        mounted() {
          Fliplet.Session.get().then(session => {
            loggedUser = _.get(session, 'entries.dataSource.data');

            if (loggedUser) {
              this.getComments();
            } else {
              showToastMessage('You need to be logged in to see the comments');
            }
          });
        }
      });
    });
  }
});
