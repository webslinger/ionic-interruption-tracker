var horology = angular.module('interrupted', ['ionic'])
    .run(function($ionicPlatform) {
        $ionicPlatform.ready(function() {
            if(window.cordova && window.cordova.plugins.Keyboard) {
                cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
                cordova.plugins.Keyboard.disableScroll(true);
            }
            if(window.StatusBar) {
                StatusBar.styleDefault();
            }
        });
    })

    /* Custom Filters */
    .filter('scoreToSpace', function() {
        return function(text) {
            return text.replace(/\_/g,' ');
        }
    })

    .filter('timeString', function() {
        return function(time) {
            time.hours = (Math.floor(time.total/1000/60/60) % 24);
            time.minutes = (Math.floor(time.total/1000/60) % 60);
            time.seconds = (Math.floor(time.total/1000) % 60);
            for (uom in time) {
                if (uom == 'total') continue;
                if (time.hasOwnProperty(uom)) {
                    if (time[uom].toString().length < 2) {
                        time[uom] = '0' + time[uom];
                    }
                }
            }
            return time.hours + ':' + time.minutes + ':' + time.seconds;
        }
    })

    /* Services */
    .service('scopes', function($rootScope) {
        var mem = {};
        return {
            set: function(key, value) {
                mem[key] = value;
            },
            get: function(key) {
                return mem[key];
            },
            xp: function() {
                return mem;
            }
        }
    })
    .service('history', function() {
        return {
            data: JSON.parse(localStorage.getItem('horology_history')) || {},
            update: function() {
                this.data = JSON.parse(localStorage.getItem('horology_history')) || {}
            }
        }
    })

    /* Controllers */
    .controller('uiCtrl', ['$scope','scopes', function($scope, scopes) {
        $scope.showApp = function() {
            scopes.get('taskCtrl').hide = false;
            scopes.get('historyCtrl').hide = true;
        };

        $scope.showHistory = function() {
            scopes.get('taskCtrl').hide = true;
            scopes.get('historyCtrl').hide = false;
            scopes.get('historyCtrl').update();
        };
    }])

    .controller('historyCtrl', ['$scope', 'scopes', 'history', '$ionicPopup', function($scope, scopes, history, $ionicPopup) {
        $scope.history = history.data;
        $scope.isEmpty = function() {
            for (var prop in history.data) {
                if (history.data.hasOwnProperty(prop)) {
                    return false;
                }
            }
            return true;
        };

        /* Get Latest Data */
        $scope.update = function() {
            history.update();
            $scope.history = history.data;
        };

        /* Confirm before Dropping Logs */
        $scope.showConfirm = function() {
            var confirmPopup = $ionicPopup.confirm({
                title: 'Erase Logs',
                template: 'Are you sure you want to erase the logs?'
            });
            confirmPopup.then(function(confirmed) {
                if (confirmed) {
                    localStorage.setItem('horology_history', false);
                    history.data = false;
                    $scope.logs = 0;
                    $scope.update();
                    console.log(history);
                }
            })
        };

        /* Hide History from View? */
        $scope.hide = true;

        /* Register Scope with uiCtrl */
        scopes.set('historyCtrl', $scope);
    }])

    .controller('taskCtrl', ['$scope', 'history', 'scopes', '$ionicPopup', '$filter', function($scope, history, scopes, $ionicPopup, $filter) {
        var ticks = 0;
        function log() {
            var key, task;
            history.update();
            for (var t = 0; t < $scope.timers.length; t++) {
                task = $scope.timers[t];
                key = task.todayString();
                history.data[key] = history.data[key] || {};
                history.data[key][task.label] = {
                    label: task.label,
                    time_worked: task.time_worked,
                    time_stopped: task.time_stopped,
                    interruptions: task.stoppage,
                    canceled: task.canceled || false
                };
            }
            localStorage.setItem('horology_history', JSON.stringify(history.data));
            sessionStorage.setItem('timers', JSON.stringify($scope.timers));
            sessionStorage.setItem('last_saved', new Date().getTime());
        }

        /* Tick, Tick, Tick... */
        setInterval(function() {
            for ( var t = 0; t < $scope.timers.length; t++ ) {
                if (!$scope.timers[t].complete) {
                    $scope.timers[t].tick($scope);
                }
            }
            ticks++;
            if (ticks%10 === 0) log();
        }, 999);

        $scope.timers = [];

        $scope.startTask = function(label) {
            $scope.timers.push(new Timer({
                label: label
            }));
            log();
        };

        $scope.completeTask = function(task) {
            task.complete = true;
            log();
            $scope.timers = $filter('filter')($scope.timers, {label: '!' + task.label});
            log();
            scopes.get('historyCtrl').update();
        };

        $scope.cancelTask = function(task) {
            task.canceled = true;
            task.complete = true;
            log();
            $scope.timers = $filter('filter')($scope.timers, {label: '!' + task.label})
            log();
            scopes.get('historyCtrl').update();
        };

        $scope.showPopup = function() {
            $scope.data = {};
            var popup = $ionicPopup.show({
                template: '<input type="text" ng-model="data.label">',
                title: 'New Task',
                subTitle: 'Enter the name of this task.',
                scope: $scope,
                buttons: [
                    { text: 'Cancel' },
                    {
                        text: '<b>Start</b>',
                        type: 'button-positive',
                        onTap: function(e) {
                            if ($scope.data.label) {
                                return $scope.data.label;
                            } else {
                                e.preventDefault();
                            }
                            $scope.label = '';
                        }
                    }
                ]
            });
            popup.then(function(response) {
                popup.close();
                $scope.startTask(response);
            });
        };

        /* Register Scope with uiCtrl */
        scopes.set('taskCtrl', $scope);

        var sessionTimers = JSON.parse(sessionStorage.getItem('timers'));
        var lastSaved = parseInt(sessionStorage.getItem('last_saved'));
        if (sessionTimers) {
            for (var t = 0; t < sessionTimers.length; t++) {
                $scope.timers[t] = new Timer({
                    label: sessionTimers[t].label
                });
                $scope.timers[t].paused = true;
                $scope.timers[t].time_worked = sessionTimers[t].time_worked;
                $scope.timers[t].time_stopped = sessionTimers[t].time_stopped;
            }
        }
        log();
    }]);

/* Our Task Object */
var Timer = function(options) {
    /* Properties */
    this.label = options.label;
    this.stopped = false;
    this.paused = false;
    this.stoppage = 0;
    this.time_worked = {
        total: 0,
        hours: '00',
        minutes: '00',
        seconds: '00'
    };
    this.time_stopped = {
        total: 0,
        hours: '00',
        minutes: '00',
        seconds: '00'
    };
    return this;
};

Timer.prototype = {
    /* Utility */
    toTimeString: function(time) {
        time.hours = (Math.floor(time.total/1000/60/60) % 24);
        time.minutes = (Math.floor(time.total/1000/60) % 60);
        time.seconds = (Math.floor(time.total/1000) % 60);
        for (uom in time) {
            if (uom == 'total') continue;
            if (time.hasOwnProperty(uom)) {
                if (time[uom].toString().length < 2) {
                    time[uom] = '0' + time[uom];
                }
            }
        }
        return time.hours + ':' + time.minutes + ':' + time.seconds;
    },
    todayString: function() {
        return new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            new Date().getDate()
        ).toDateString().replace(/\s/g,'_');
    },
    /* Operational */
    interrupt: function() {
        if (this.paused) return;
        this.stopped = true;
        this.stoppage++;
    },
    resume: function() {
        if (this.paused) return;
        this.stopped = false;
    },
    pause: function() {
        this.paused = true;
        document.getElementById('play').style.display = '';
        document.getElementById('pause').style.display = 'none';
    },
    play: function() {
        this.paused = false;
        document.getElementById('play').style.display = 'none';
        document.getElementById('pause').style.display = '';
    },
    toggleShowControls: function(toggle) {
        this.showControls = (toggle) ? true : false;
    },
    tick: function($scope) {
        if (this.paused) {
            return;
        } else if (this.stopped) {
            this.time_stopped.total += 1000;
        } else {
            this.time_worked.total += 1000;
        }
        $scope.$apply();
    }
};