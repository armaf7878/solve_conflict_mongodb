// services/ticketService.js

const Ticket = require('../models/Ticket'); 
const mongoose = require('mongoose');

const MAX_RETRIES = 5;

// Hàm này cố tình không sắp xếp seat1Id và seat2Id để tạo điều kiện Deadlock/Xung đột
const bookSeatsTransaction = async (userId, showtimeId, seat1Id, seat2Id, price) => {
    const session = await mongoose.startSession();
    
    // Gán trực tiếp để tạo thứ tự khóa không nhất quán
    const firstSeatId = seat1Id;  // Tài nguyên X (T1 muốn)
    const secondSeatId = seat2Id; // Tài nguyên Y (T2 muốn)

    // const seatsToBook = [seat1Id, seat2Id].sort();
    // const [firstSeatId, secondSeatId] = seatsToBook;
    
    const transactionBody = async () => {
        
        console.log(`[USER: ${userId}] Bắt đầu Giao tác. Khóa theo thứ tự: [${firstSeatId}, ${secondSeatId}]`);

        // 1. Ghi/Khóa Tài nguyên Thứ nhất
        const ticket1 = new Ticket({
            user_id: userId, showtime_id: showtimeId, seat_id: firstSeatId, price: price,
        });
        
        const existingSeat1 = await Ticket.findOne({ showtime_id: showtimeId, seat_id: firstSeatId }).session(session);
        if (existingSeat1) {
            throw new Error(`Ghế ${firstSeatId} đã có người đặt (Kiểm tra lại).`);
        }
        await ticket1.save({ session });
        console.log(`[USER: ${userId}] ĐÃ GIỮ KHÓA: Ghế ${firstSeatId}.`);

        // ĐỘ TRỄ 
        await new Promise(resolve => setTimeout(resolve, 1000)); 

        // 2. Ghi/Khóa Tài nguyên Thứ hai (Tài nguyên mà giao tác khác đang giữ)
        console.log(`[USER: ${userId}] CHỜ KHÓA: Ghế ${secondSeatId}...`);
        
        // Kiểm tra Ghế 2 trước khi save
        const existingSeat2 = await Ticket.findOne({ showtime_id: showtimeId, seat_id: secondSeatId }).session(session);
        if (existingSeat2) {
             throw new Error(`Ghế ${secondSeatId} đã có người đặt (Kiểm tra lại).`);
        }
        
        const ticket2 = new Ticket({
            user_id: userId, showtime_id: showtimeId, seat_id: secondSeatId, price: price,
        });
        await ticket2.save({ session });
        console.log(`[USER: ${userId}] ĐÃ KHÓA: Ghế ${secondSeatId}.`);

        return [ticket1, ticket2];
    };

    // Fix: Cơ chế Thử lại (Retry Logic) ---
    let retries = 0;
    let result = null;

    try {
        while (retries < MAX_RETRIES) {
            try {
                result = await session.withTransaction(transactionBody);
                console.log(`[USER: ${userId}] Giao tác hoàn thành sau ${retries} lần thử lại.`);
                break; 
            } catch (error) {
                // Deadlock/Write Conflict (error code 112)
                if (error.code === 112 || error.code === 12101 || error.name === 'MongoError' && (error.message.includes('Write Conflict') || error.message.includes('deadlock'))) {
                    retries++;
                    console.log(`[USER: ${userId}] 💥 DEADLOCK/XUNG ĐỘT PHÁT HIỆN, thử lại lần ${retries}...`);
                    if (retries === MAX_RETRIES) {
                        throw new Error("Giao tác thất bại sau nhiều lần thử lại do Deadlock/Xung đột.");
                    }
                    await new Promise(resolve => setTimeout(resolve, 100 * retries)); 
                } else {
                    throw error; // Lỗi nghiệp vụ hoặc lỗi nghiêm trọng
                }
            }
        }
        
        if (!result) {
             throw new Error("Giao tác không hoàn thành trong giới hạn cho phép.");
        }
        return result;

    } catch (error) {
        console.error(`[USER: ${userId}] Giao tác thất bại cuối cùng:`, error.message);
        throw error;
    } finally {
        await session.endSession();
    }
};

const holdLockAndBlock = async (userId, showtimeId, seatId, price) => {
    const session = await mongoose.startSession();
    
    try {
        await session.withTransaction(async () => {
            console.log(`\n[T_B/LOCK HOLDER: ${userId}] Bắt đầu giao tác giữ khóa.`);

            // 1. Kiểm tra và Khóa Ghế (Locking the seat document)
            const existingTicket = await Ticket.findOne({ showtime_id: showtimeId, seat_id: seatId }).session(session);

            if (existingTicket) {
                console.log(`[T_B/LOCK HOLDER: ${userId}] Ghế ${seatId} đã có người đặt trước đó. Rollback.`);
                // Ném lỗi để rollback giao tác này
                throw new Error(`Ghế ${seatId} đã đặt.`); 
            }
            
            // Tạo bản ghi nhưng CHƯA COMMIT
            const ticket = new Ticket({
                user_id: userId,
                showtime_id: showtimeId,
                seat_id: seatId,
                price: price,
                status: 'pending_payment' // Giả lập trạng thái đang giữ chỗ
            });
            await ticket.save({ session });
            
            console.log(`[T_B/LOCK HOLDER: ${userId}] ĐÃ GIỮ KHÓA (LOCK HELD) trên Ghế ${seatId} trong 30 giây.`);
            
            // 2. Tạm dừng dài để giữ khóa và chặn giao tác khác
            // Giao tác này đang GIỮ KHÓA và không COMMIT
            await new Promise(resolve => setTimeout(resolve, 30000)); 

            // Sau khi hết giờ, ROLLBACK giao tác này (để không làm bẩn DB)
            // Lệnh throw dưới đây sẽ buộc withTransaction thực hiện rollback
            throw new Error(`[T_B/LOCK HOLDER: ${userId}] Giữ khóa đã hết giờ. Rollback để nhả khóa.`); 
        });

    } catch (error) {
        console.log(`[T_B/LOCK HOLDER: ${userId}] Giao tác giữ khóa kết thúc: ${error.message}`);
    } finally {
        await session.endSession();
    }
};
module.exports = {
    bookSeatsTransaction,
    holdLockAndBlock
};