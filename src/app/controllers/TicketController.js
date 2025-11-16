const Ticket = require('../models/Ticket')
const User = require('../models/User')
const Showtime = require('../models/Showtime')
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
class TicketController{
    //[POST] - ticket/create
    async create(req, res){
        try{
            const{user_id, showtime_id, seat_id, price} = req.body;
            const userExists = await User.findById(user_id);
            if(!userExists){
                return res.status(404).json({message:'Người dùng không tồn tại'})
            };
            const showtimeExists = await Showtime.findOne({'_id': showtime_id, 'status': 'Active'}, {})
            if(!showtimeExists){
                return res.status(404).json({message:'Showtime đã bị khóa hoặc không tồn tại'})
            };

            const seatValid = showtimeExists.seats.some(
                (seat) => seat.seat_id === seat_id && seat.status === 'available'
            );
            if(!seatValid){
                return res.status(404).json({message: 'Ghế không tồn tại hoặc đã bị đặt bởi người khác'})
            };

            const existsTicket = await Ticket.findOne({
                showtime_id: new ObjectId(showtime_id),
                seat_id: seat_id,
                status: { $in: ['pending_payment', 'paid'] }
            });
            
            if(existsTicket){
                return res.status(409).json({
                    message: 'Ghế này đã được đặt bởi người khác'
                });
            };

            const newTicket = new Ticket({
                user_id,
                showtime_id,
                seat_id,
                price,
                status: 'pending_payment'
            });

            const savedTicket = await newTicket.save();
            await Showtime.updateOne(
                { _id: showtime_id, "seats.seat_id": seat_id },
                { $set: { "seats.$.status": "locked" } }
            );
            return res.status(200).json({
                    message: 'Đặt vé thành công',
                    ticket: savedTicket
                }) 
        } catch (err){
            console.error('Lỗi đặt vé', err.code);
            if(err.code === 11000){
                return res.status(409).json({
                    message: 'Xung đột vé đã tồn tại',
                    error: err.message
                });
            };

            return res.status(500).json({
                message: 'Lỗi máy chủ',
                error: err.message
            });
        }
    }

    //[GET] - ticket/payment/:ticketID
    async payment(req, res){
        const session = await  mongoose.startSession()
        const ticketId = req.params.id;
        try{
            session.startTransaction();
            const ticket = await Ticket.findById(ticketId).session(session);
            if(!ticket){
                throw new Error("Vé không tồn tại");
            }
            if(ticket.status !== 'pending_payment'){
                throw new Error("Vé không còn trong trạng thái chờ thanh toán");
            }

            const currentVersion = ticket.version;
            
            const ticketUpdate = await Ticket.updateOne(
                {_id: ticketId, status: 'pending_payment', version: currentVersion},
                {$set:{status: "paid"}, $inc: {version: 1}},
                {session}
            );

            if (ticketUpdate.modifiedCount === 0 ){
                throw new Error("Vé đã bị xử lý bởi tiến trình khác");
            }

            await User.updateOne(
                {_id: ticket.user_id},
                {$inc: {wallet: -ticket.price}},
                {session}
            );

            await Showtime.updateOne(
                {   
                    _id: ticket.showtime_id,
                    "seats.seat_id": ticket.seat_id
                },

                {
                    $set:{
                        "seats.$.status": "booked"
                    }
                },
                {session}
            )

            await session.commitTransaction();
            session.endSession()
            return res.status(200).json({
                'message': 'Đã lấy được ticket',
                'data': ticket
            })
        }
        catch(err){
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                'message': 'Lỗi trong thanh toán vé',
                'error':err.message
            })
        }

    }

    //[Cron Job]
    async expireTicket(){
        console.log("Kiểm tra cron job có hoạt động");
        const ticketsExpire = await Ticket.find(
                {
                    status: 'pending_payment',
                    createdAt: {$lt: new Date(Date.now() - 3*60*1000) }
                }
            )
        for (const t of ticketsExpire){
            const session = await mongoose.startSession();
            session.startTransaction();
            try{
                const currentVersion = t.version;
                const ticketUpdate = await Ticket.updateOne(
                    {
                        _id: t._id,
                        status: 'pending_payment',
                        version: currentVersion
                    },

                    {
                        $set: {status: 'canceled'},
                        $inc:{version: 1}
                    },
                    {session}
                );

                if (ticketUpdate.modifiedCount === 0){
                    await session.abortTransaction();
                    session.endSession();
                    continue;
                };

                await Showtime.updateOne(
                    {_id: t.showtime_id, "seats.seat_id": t.seat_id},
                    {$set: {"seats.$.status": "available"}},
                    {session}
                );

                await session.commitTransaction();
                session.endSession();
            }
            catch (err){
                await session.abortTransaction();
                session.endSession();
            }
        }
        
    }
}
module.exports = new TicketController()