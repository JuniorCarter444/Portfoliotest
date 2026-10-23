// Payments taken after the initial booking:
// - the security deposit: the customer pays it through a link once BG LUX has reviewed their verification
//   (charged, then refunded in full or part after the return; card holds expire too soon for a 3-week refund window)
// - the remaining hire balance, charged to the card saved at checkout.
// Without a Stripe key everything is simulated so the flow can be tried in demo mode.
const crypto = require('crypto');

const pence = (pounds) => Math.round(pounds * 100);

class PaymentError extends Error {}

function friendly(err) {
  if (err.code === 'authentication_required') {
    return new PaymentError("The customer's bank wants them to approve this payment, so it can't be taken remotely. Take it in person on a card terminal instead.");
  }
  if (err.type === 'StripeCardError') return new PaymentError(`Card declined: ${err.message}`);
  return new PaymentError(err.message || 'Payment failed');
}

function createPayments(stripe, currency) {
  return {
    live: Boolean(stripe),

    // Returns the Stripe Checkout URL for the deposit, or null in demo mode (the caller marks it paid).
    async depositCheckoutUrl(b, { successUrl, cancelUrl }) {
      if (!stripe) return null;
      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          customer: b.stripeCustomerId || undefined,
          customer_email: b.stripeCustomerId ? undefined : b.email,
          line_items: [{
            quantity: 1,
            price_data: {
              currency,
              unit_amount: pence(b.securityDeposit.amount),
              product_data: { name: `Refundable security deposit: ${b.carName}`, description: `Booking ${b.ref}. Refunded 3 weeks after the vehicle is returned, less any charges under the rental terms.` }
            }
          }],
          metadata: { bookingId: b.id, type: 'security_deposit' },
          payment_intent_data: { metadata: { bookingId: b.id, type: 'security_deposit' } },
          success_url: successUrl,
          cancel_url: cancelUrl
        });
        return session.url;
      } catch (err) {
        throw friendly(err);
      }
    },

    async refund(intentId, amount) {
      if (!stripe || !intentId || !(amount > 0)) return null;
      try {
        const refund = await stripe.refunds.create({ payment_intent: intentId, amount: pence(amount) });
        return refund.id;
      } catch (err) {
        throw friendly(err);
      }
    },

    async chargeBalance(b, amount) {
      if (!stripe) return `demo_${crypto.randomUUID()}`;
      if (!b.stripeCustomerId || !b.paymentMethodId) throw new PaymentError('No saved card for this booking.');
      try {
        const pi = await stripe.paymentIntents.create({
          amount: pence(amount),
          currency,
          customer: b.stripeCustomerId,
          payment_method: b.paymentMethodId,
          off_session: true,
          confirm: true,
          description: `Balance ${b.ref}: ${b.carName}`,
          metadata: { bookingId: b.id, type: 'balance' }
        });
        return pi.id;
      } catch (err) {
        throw friendly(err);
      }
    },

    PaymentError
  };
}

module.exports = { createPayments, PaymentError };
