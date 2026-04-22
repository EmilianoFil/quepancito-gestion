class Store {
  constructor() {
    this.state = {
      user: null,
      currentRoute: null,
    };
    this._listeners = new Set();
  }

  setUser(user) {
    this.state.user = user;
    this._notify();
  }

  setRoute(route) {
    this.state.currentRoute = route;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    this._listeners.forEach(fn => fn(this.state));
  }
}

export const store = new Store();
