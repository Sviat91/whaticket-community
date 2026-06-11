import React, { useEffect } from "react";
import Routes from "./routes";
import "react-toastify/dist/ReactToastify.css";
import "./index.css";

const App = () => {
  useEffect(() => {
    const i18nlocale = localStorage.getItem("i18nextLng");
    // locale logic kept for potential future use
    if (i18nlocale) {
      // no-op: locale is handled by i18n initialization
    }
  }, []);

  return <Routes />;
};

export default App;
