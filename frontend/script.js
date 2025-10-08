document.addEventListener('DOMContentLoaded', () => {
    const payBtn = document.getElementById('pay-btn');
    const amountEl = document.getElementById('amount');
    const orderIdEl = document.getElementById('order-id');

    const urlParams = new URLSearchParams(window.location.search);
    const paymentSessionId = urlParams.get('payment_session_id');

    if (!paymentSessionId) {
        handleError('Payment session ID not found.');
        return;
    }

    const fetchOrderDetails = async () => {
        try {
            // Update this URL to your production backend when deploying
            const response = await fetch(`http://localhost:5000/api/payments/methods?paymentSessionId=${paymentSessionId}`);
            
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            
            const data = await response.json();

            if (data.success) {
                amountEl.textContent = `₹${data.order_details.order_amount}`;
                orderIdEl.textContent = data.order_details.order_id;
            } else {
                throw new Error(data.error || 'Could not fetch payment details.');
            }

        } catch (error) {
            console.error('Fetch error:', error);
            handleError(error.message);
        }
    };

    fetchOrderDetails();

    // ✅ FIXED: Added mode parameter
    payBtn.addEventListener('click', async () => {
        try {
            // Initialize Cashfree with mode
            const cashfree = Cashfree({
                mode: "sandbox" // Change to "production" for live payments
            });

            // Checkout options
            const checkoutOptions = {
                paymentSessionId: paymentSessionId,
                redirectTarget: "_modal" // "_modal" for popup, "_self" for redirect
            };

            // Open payment gateway
            cashfree.checkout(checkoutOptions).then((result) => {
                if (result.error) {
                    console.error('Payment Error:', result.error);
                    alert('Payment failed: ' + result.error.message);
                }
                
                if (result.redirect) {
                    console.log("Redirecting to payment gateway...");
                }
            });

        } catch (error) {
            console.error('Checkout initialization error:', error);
            alert('Failed to initialize payment. Please try again.');
        }
    });

    function handleError(message) {
        const paymentBox = document.querySelector('.payment-box');
        paymentBox.innerHTML = `
            <h1>❌ Error</h1>
            <p>${message}</p>
            <button onclick="window.location.reload()" class="pay-button">
                Try Again
            </button>
        `;
        payBtn.disabled = true;
    }
});
