package main

import (
	"flag"
	"fmt"
	"net"
	"strconv"
	"strings"
)

const (
	defaultListenHost = "127.0.0.1"
	defaultListenPort = "4422"
	defaultListenAddr = defaultListenHost + ":" + defaultListenPort
	defaultServerHost = "localhost"
	defaultServerURL  = "http://" + defaultServerHost + ":" + defaultListenPort
)

func registerListenAddrFlag(fs *flag.FlagSet) *string {
	return fs.String("addr", defaultListenAddr, fmt.Sprintf("listen address (default %s)", defaultListenAddr))
}

func normalizeListenAddr(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return defaultListenAddr, nil
	}

	if strings.HasPrefix(raw, ":") {
		raw = net.JoinHostPort(defaultListenHost, strings.TrimPrefix(raw, ":"))
	} else if _, err := strconv.Atoi(raw); err == nil {
		raw = net.JoinHostPort(defaultListenHost, raw)
	}

	host, port, err := net.SplitHostPort(raw)
	if err != nil {
		return "", fmt.Errorf("invalid listen address %q: want [host]:port", raw)
	}
	if host == "" {
		host = defaultListenHost
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil {
		return "", fmt.Errorf("invalid listen address %q: port must be numeric", raw)
	}
	if portNumber < 1 || portNumber > 65535 {
		return "", fmt.Errorf("invalid listen address %q: port must be between 1 and 65535", raw)
	}
	return net.JoinHostPort(host, port), nil
}
