from flask import Flask
from OpenSSL import crypto

def generate_self_signed_cert():
    # Create a key pair
    k = crypto.PKey()
    k.generate_key(crypto.TYPE_RSA, 2048)

    # Create a self-signed cert
    cert = crypto.X509()
    cert.get_subject().C = "IN"
    cert.get_subject().ST = "Kerala"
    cert.get_subject().L = "Thiruvananthapuram"
    cert.get_subject().O = "Your Company"
    cert.get_subject().OU = "Attendance System"
    cert.get_subject().CN = "attendance.local"
    cert.set_serial_number(1000)
    cert.gmtime_adj_notBefore(0)
    cert.gmtime_adj_notAfter(10*365*24*60*60)  # 10 years
    cert.set_issuer(cert.get_subject())
    cert.set_pubkey(k)
    cert.sign(k, 'sha256')

    # Save the key and cert
    with open("essl-sync/ssl/key.pem", "wb") as f:
        f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
    with open("essl-sync/ssl/cert.pem", "wb") as f:
        f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))

def configure_ssl(app):
    app.config['SSL_CERT'] = 'essl-sync/ssl/cert.pem'
    app.config['SSL_KEY'] = 'essl-sync/ssl/key.pem'

    # Generate cert if not exists
    if not os.path.exists(app.config['SSL_CERT']) or not os.path.exists(app.config['SSL_KEY']):
        generate_self_signed_cert()
