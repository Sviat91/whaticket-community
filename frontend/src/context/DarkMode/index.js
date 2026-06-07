import React, { createContext, useState, useContext, useMemo } from "react";
import PropTypes from "prop-types";
import { createMuiTheme, ThemeProvider as MUIThemeProvider } from "@material-ui/core/styles";
import { CssBaseline } from "@material-ui/core";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [darkMode, setDarkMode] = useState(
    localStorage.getItem("darkMode") === "true"
  );

  const toggleTheme = () => {
    setDarkMode((prev) => {
      localStorage.setItem("darkMode", !prev);
      return !prev;
    });
  };

  const theme = useMemo(() => createMuiTheme({
    palette: {
      type: darkMode ? "dark" : "light",
      primary: { main: "#25D366" },
      ...(darkMode && {
        background: {
          default: "#111B21",
          paper:   "#1F2C34",
        },
      }),
    },
    scrollbarStyles: {
      "&::-webkit-scrollbar": { width: "6px", height: "6px" },
      "&::-webkit-scrollbar-thumb": {
        backgroundColor: darkMode ? "#374045" : "#c1c1c1",
        borderRadius: "3px",
      },
    },
  }), [darkMode]);

  const contextValue = useMemo(() => ({ darkMode, toggleTheme }), [darkMode]);

  return (
    <ThemeContext.Provider value={contextValue}>
      <MUIThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MUIThemeProvider>
    </ThemeContext.Provider>
  );
};
ThemeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useThemeContext = () => useContext(ThemeContext);
