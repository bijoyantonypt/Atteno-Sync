#!/bin/bash

# Allow only essential traffic to the eSSL device
iptables -A INPUT -p tcp --dport 4370 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 4370 -j DROP

# Block all outbound traffic from the sync service
iptables -A OUTPUT -o eth0 -j DROP

# Allow only necessary local connections
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT