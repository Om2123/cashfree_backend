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
            const response = await fetch(`http://localhost:5000/api/payments/methods?paymentSessionId=${paymentSessionId}`);
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            const data = await response.json();

            if (data.success) {
                amountEl.textContent = `₹ ${data.order_details.order_amount}`;
                orderIdEl.textContent = data.order_details.order_id;
            } else {
                throw new Error(data.error || 'Could not fetch payment details.');
            }

        } catch (error) {
            handleError(error.message);
        }
    };

    fetchOrderDetails();

    payBtn.addEventListener('click', () => {
        const cashfree = new Cashfree();
        cashfree.checkout({
            paymentSessionId: paymentSessionId,
            redirectTarget: "_self"
        }).then((result) => {
            if (result.error) {
                alert(result.error.message);
            }
            if (result.redirect) {
                console.log("Redirection");
            }
        });
    });

    function handleError(message) {
        const paymentBox = document.querySelector('.payment-box');
        paymentBox.innerHTML = `<h1>Error</h1><p>${message}</p>`;
        payBtn.disabled = true;
    }
});
