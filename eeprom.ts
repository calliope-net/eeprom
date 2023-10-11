
//% color=#FF7F3F icon="\uf2db" block="EEPROM Qwiic" weight=14
namespace eepromCAT24C512
/* 230826 231011 https://github.com/calliope-net/eeprom
https://www.sparkfun.com/products/18355
[Datasheet] https://www.onsemi.com/pub/Collateral/CAT24C512-D.PDF
https://learn.sparkfun.com/tutorials/qwiic-eeprom-hookup-guide


https://github.com/sparkfun/Qwiic_EEPROM_Py/archive/main.zip 
Nach dem Beispiel-Code 'qwiic_eeprom.py'
https://github.com/sparkfun/Qwiic_EEPROM_Py/blob/main/qwiic_eeprom.py
neu programmiert von Lutz Elßner im August 2023

I2C_BUFFER_LENGTH = 32 Bytes kann I2C mit einem Aufruf max. schreiben oder lesen
bei write muss die 16-Bit Adresse (eeprom_location) am Anfang gesendet werden
für Daten bleiben bei write noch 30 Bytes übrig
bei read können 32 Bytes gelesen werden, die 16-Bit Adresse wurde vorher extra gesendet

die page_size_bytes = 128 darf bei write auch nicht überschritten werden
4*30 Bytes sind 120; beim 5. write wird die page_size 128 überschritten
es müssen 8 Bytes auf die 1. page und 22 Bytes auf die 2. page gesendet werden
wenn die Anfangsadresse (eeprom_location) mitten in der page liegt, verschiebt sich das

das wird in der function write alles berücksichtigt

Update Okt 2023: bei EEPROM ist die Buffer-Länge nicht auf 32 beschränkt, 
    wahrscheinlich ganze Page (2+128) Byte in einem Buffer möglich
*/ {
    export enum eADDR { // 0x50 bis 0x57
        EEPROM_x50 = 0x50, EEPROM_x51 = 0x51, EEPROM_x52 = 0x52, EEPROM_x53 = 0x53,
        EEPROM_x54 = 0x54, EEPROM_x55 = 0x55, EEPROM_x56 = 0x56, EEPROM_x57 = 0x57
    }
    let n_i2cCheck: boolean = false // i2c-Check
    let n_i2cError: number = 0 // Fehlercode vom letzten WriteBuffer (0 ist kein Fehler)

    const I2C_BUFFER_LENGTH = 32
    // EEPROM: CAT24C512
    // 24XX512 - 524288 bit / 65536 bytes - 2 address bytes, 128 byte page size
    const memory_size_bytes = 65536
    const page_size_bytes = 128
    const page_write_time_ms = 5 // All EEPROMs seem to have a max write time of 5ms
    const poll_for_write_complete = false // true
    const addressSize_bytes = 2

    // TODO
    function is_connected(pADDR: eADDR) { return true }

    function is_busy(pADDR: eADDR) { return !is_connected(pADDR) }


    //% group="beim Start"
    //% block="i2c-Check %ck"
    //% ck.shadow="toggleOnOff" ck.defl=1
    export function beimStart(ck: boolean) {
        n_i2cCheck = ck
        n_i2cError = 0 // Reset Fehlercode
    }

    //% group="EEPROM 512 Page-Adressen je 128 Byte"
    //% block="Page %x3 %x2 %x1"
    export function page(x4: H4, x3: H3, x2: H2) {
        return x4 + x3 + x2
    }

    // ========== group="i2c EEPROM lesen (Adr: 0 ... 65535)"

    //% group="i2c EEPROM lesen (Adr: 0 ... 65535)"
    //% block="i2c %pADDR Adr %eeprom_location 1 Byte lesen" weight=8
    //% pADDR.shadow="eeprom_eADDR"
    //% eeprom_location.min=0 eeprom_location.max=65535
    export function read_byte(pADDR: number, eeprom_location: number): number {
        let bu = Buffer.create(2)
        bu.setNumber(NumberFormat.UInt16BE, 0, eeprom_location)
        i2cWriteBuffer(pADDR, bu, true)
        return i2cReadBuffer(pADDR, 1).getUint8(0)
    }

    //% group="i2c EEPROM lesen (Adr: 0 ... 65535)" advanced=true
    //% block="i2c %pADDR Adr %eeprom_location 1 Zahl %format lesen" weight=6
    //% pADDR.shadow="eeprom_eADDR"
    //% eeprom_location.min=0 eeprom_location.max=65535 format.defl=NumberFormat.UInt16BE
    export function read_number(pADDR: number, eeprom_location: number, format: NumberFormat): number {
        let bu = Buffer.create(2)
        bu.setNumber(NumberFormat.UInt16BE, 0, eeprom_location)
        i2cWriteBuffer(pADDR, bu, true)
        return i2cReadBuffer(pADDR, Buffer.sizeOfNumberFormat(format)).getNumber(format, 0)
    }

    //% group="i2c EEPROM lesen (Adr: 0 ... 65535)"
    //% block="i2c %pADDR Adr %eeprom_location Text %string_length Zeichen lesen" weight=4
    //% pADDR.shadow="eeprom_eADDR"
    //% eeprom_location.min=0 eeprom_location.max=65535 string_length.defl=32
    export function read_string(pADDR: number, eeprom_location: number, string_length: number): string {
        return read_buffer(pADDR, eeprom_location, string_length).toString()
    }

    //% group="i2c EEPROM lesen (Adr: 0 ... 65535)"
    //% block="i2c %pADDR Adr %eeprom_location Array %num_bytes max 32 Byte lesen" weight=2
    //% pADDR.shadow="eeprom_eADDR"
    //% eeprom_location.min=0 eeprom_location.max=65535
    //% num_bytes.min=1 num_bytes.max=32 num_bytes.defl=32
    export function read_array(pADDR: number, eeprom_location: number, num_bytes: number): number[] {
        return read_buffer(pADDR, eeprom_location, num_bytes).toArray(NumberFormat.Int8LE)
    }

    //% group="i2c EEPROM lesen (Adr: 0 ... 65535)" advanced=true
    //% block="i2c %pADDR Adr %eeprom_location Buffer %num_bytes Bytes lesen" weight=1
    //% pADDR.shadow="eeprom_eADDR"
    //% eeprom_location.min=0 eeprom_location.max=65535
    //% num_bytes.min=1 num_bytes.defl=32
    export function read_buffer(pADDR: number, eeprom_location: number, num_bytes: number): Buffer {
        let received: number = 0
        let data_buffer: Buffer = Buffer.create(0) //, data_list: number[] = []
        let amount_to_read: number
        let bu: Buffer

        while (received < num_bytes) {

            //  Limit the amount to read to a page size amt_to_read = num_bytes - received
            amount_to_read = num_bytes - received
            if (amount_to_read > I2C_BUFFER_LENGTH) { amount_to_read = I2C_BUFFER_LENGTH }

            // See if EEPROM is available or still writing to a previous request
            if (poll_for_write_complete) {
                while (is_busy(pADDR)) { sleep(0.001) } // This shortens the amount of time waiting between writes but hammers the I2C bus
            }

            bu = Buffer.create(2)
            bu.setNumber(NumberFormat.UInt16BE, 0, eeprom_location)
            i2cWriteBuffer(pADDR, bu, true)

            data_buffer = data_buffer.concat(i2cReadBuffer(pADDR, amount_to_read))
            //data_list.concat(i2cReadBuffer(pADDR, amt_to_read).toArray(NumberFormat.Int8LE))

            received = received + amount_to_read
        }
        return data_buffer // data_list
    }



    // ========== group="i2c EEPROM schreiben (Adr: 0 ... 65535)"

    //% group="i2c EEPROM schreiben (Adr: 0 ... 65535)"
    //% block="i2c %pADDR Adr %eeprom_location 1 Byte %byte_to_write schreiben" weight=8
    //% pADDR.shadow="eeprom_eADDR"
    //% eeprom_location.min=0 eeprom_location.max=65535
    export function write_byte(pADDR: number, eeprom_location: number, byte_to_write: number) {
        if (read_byte(pADDR, eeprom_location) != byte_to_write) { // Update only if data is new
            let bu = Buffer.create(3)
            bu.setNumber(NumberFormat.UInt16BE, 0, eeprom_location)
            bu.setUint8(2, byte_to_write)
            i2cWriteBuffer(pADDR, bu)
        }
    }

    //% group="i2c EEPROM schreiben (Adr: 0 ... 65535)" advanced=true
    //% block="i2c %pADDR Adr %eeprom_location 1 Zahl %value %format schreiben" weight=6
    //% pADDR.shadow="eeprom_eADDR"
    //% eeprom_location.min=0 eeprom_location.max=65535 format.defl=NumberFormat.UInt16BE
    //% inlineInputMode=inline
    export function write_number(pADDR: number, eeprom_location: number, value: number, format: NumberFormat) {
        if (read_number(pADDR, eeprom_location, format) != value) { // Update only if data is new
            let bu = Buffer.create(Buffer.sizeOfNumberFormat(format) + 2)
            bu.setNumber(NumberFormat.UInt16BE, 0, eeprom_location)
            bu.setNumber(format, 2, value)
            i2cWriteBuffer(pADDR, bu)
        }
    }

    //% group="i2c EEPROM schreiben (Adr: 0 ... 65535)"
    //% block="i2c %pADDR Adr %eeprom_location Text %string_to_write schreiben" weight=4
    //% pADDR.shadow="eeprom_eADDR"
    //% eeprom_location.min=0 eeprom_location.max=65535
    //% inlineInputMode=inline
    export function write_string(pADDR: number, eeprom_location: number, string_to_write: string) {
        let bu = Buffer.create(string_to_write.length)
        for (let i = 0; i < string_to_write.length; i++) {
            bu.setUint8(i, string_to_write.charCodeAt(i))
        }
        write_buffer(pADDR, eeprom_location, bu)
    }

    //% group="i2c EEPROM schreiben (Adr: 0 ... 65535)"
    //% block="i2c %pADDR Adr %eeprom_location %data_list max 32 Byte schreiben" weight=2
    //% pADDR.shadow="eeprom_eADDR"
    //% eeprom_location.min=0 eeprom_location.max=65535
    export function write_array(pADDR: number, eeprom_location: number, data_list: number[]) {
        let bu = Buffer.create(data_list.length)
        for (let i = 0; i < bu.length; i++) {
            bu.setUint8(i, data_list.get(i))
        }
        write_buffer(pADDR, eeprom_location, bu)
    }

    //% group="i2c EEPROM schreiben (Adr: 0 ... 65535)" advanced=true
    //% block="i2c %pADDR Adr %eeprom_location %data_list Buffer schreiben" weight=1
    //% pADDR.shadow="eeprom_eADDR"
    //% eeprom_location.min=0 eeprom_location.max=65535
    export function write_buffer(pADDR: number, eeprom_location: number, data_list: Buffer) {
        let buffer_size: number = data_list.length
        let amount_to_write: number, page_number_1: number, page_number_2: number
        let bu: Buffer

        // Error check
        if (eeprom_location + buffer_size >= memory_size_bytes) {
            buffer_size = memory_size_bytes - eeprom_location
        }

        let max_write_size = page_size_bytes

        if (max_write_size > I2C_BUFFER_LENGTH - 2) {
            max_write_size = I2C_BUFFER_LENGTH - 2 // We loose two bytes to the EEPROM address
        }

        // Break the buffer into page sized chunks
        let recorded = 0
        let c = 0
        while (recorded < buffer_size) {

            // Limit the amount to write to either the page size or the Rasp Pi limit
            amount_to_write = buffer_size - recorded

            if (amount_to_write > max_write_size) { amount_to_write = max_write_size } // 30 Bytes

            if (amount_to_write > 1) {
                // check for crossing of a page line. Writes cannot cross a page line.
                page_number_1 = Math.trunc((eeprom_location + recorded) / page_size_bytes)
                page_number_2 = Math.trunc((eeprom_location + recorded + amount_to_write - 1) / page_size_bytes)
                if (page_number_2 > page_number_1) {
                    // Limit the read amount to go right up to edge of page barrier
                    amount_to_write = (page_number_2 * page_size_bytes) - (eeprom_location + recorded)
                }
            } // if


            // See if EEPROM is available or still writing a previous request
            if (poll_for_write_complete) {
                while (is_busy(pADDR)) { // Poll device
                    sleep(0.001) // This shortens the amount of time waiting between writes but hammers the I2C bus
                }
            }

            // log(0, c, c + 2, amount_to_write.toString())

            bu = Buffer.create(amount_to_write + 2) // 32
            bu.setNumber(NumberFormat.UInt16BE, 0, eeprom_location + recorded)

            for (let x = 0; x < amount_to_write; x++) { // 0..29
                //bu.setUint8(x + 2, data_list.get(recorded + x))
                bu.setUint8(x + 2, data_list.getUint8(recorded + x))
            }
            // Now, set up the full write
            i2cWriteBuffer(pADDR, bu)

            // Increment "recorded" counter
            recorded = recorded + amount_to_write
            c = c + 3

            if (!poll_for_write_complete) { // if false
                // Wenn vorher nicht gewartet wird, dann nachher warten
                sleep(page_write_time_ms / 1000) // Delay the amount of time to record a page
            }

            // Need to hard-code this delay in because if code falls into the is_busy() call above
            // error messages are printed to the command line when pinging the i2c address when it's busy
            sleep(0.005)

        } // while
    }


    //% group="i2c EEPROM schreiben (Adr: 0 ... 65535)" advanced=true
    //% block="sizeOfNumberFormat %format" weight=0
    //% format.defl=NumberFormat.UInt8LE
    export function sizeOfNumberFormat(format: NumberFormat): 0 | 4 | 2 | 1 | 8 { return Buffer.sizeOfNumberFormat(format) }



    // ========== advanced=true


    // ========== group="i2c EEPROM Page löschen (128 Byte)"

    //% group="i2c EEPROM Page löschen (128 Byte)" advanced=true
    //% block="i2c %pADDR Page %x3 %x2 %x1 löschen mit Byte %to_write" weight=6
    //% pADDR.shadow="eeprom_eADDR"
    //% to_write.min=0 to_write.max=255 to_write.defl=255
    //% inlineInputMode=inline
    export function erasePage(pADDR: number, x4: H4, x3: H3, x2: H2, to_write: number) {
        let bu = Buffer.create(page_size_bytes)
        bu.fill(to_write)
        write_buffer(pADDR, x4 + x3 + x2, bu)
    }

    // ========== group="i2c EEPROM löschen"

    // group="i2c EEPROM löschen" advanced=true
    // block="i2c %pADDR löschen mit Byte %to_write" weight=4
    /* export function erase(pADDR: eADDR, to_write: number) { // Erase entire EEPROM.
        // hier werden 4096 mal 16 Byte (+ davor 2 Byte Adresse = 18 Byte) geschrieben
        // damit wird die I2C_BUFFER_LENGTH = 32 Bytes nicht überschritten
        // und es wird die page_size_bytes = 128 nicht verlassen
        let bu: Buffer
        bu = pins.createBuffer(I2C_BUFFER_LENGTH / 2 + 2) // 32/2+2 = 18
        bu.setNumber(NumberFormat.UInt16BE, 0, 0x0000)  // 2 Byte eeprom_location
        bu.fill(to_write, 2, bu.length - 2)             // + 16 Byte Daten, Summe < 32 = I2C_BUFFER_LENGTH

        for (let eeprom_location = 0x0000; eeprom_location < memory_size_bytes; eeprom_location += bu.length - 2) { // 0 to 65536 step 16
            // 4096 Schleifen
            bu.setNumber(NumberFormat.UInt16BE, 0, eeprom_location) // 2 Byte eeprom_location
            pins.i2cWriteBuffer(pADDR, bu)
        }
    } */



    // HEX Parameter
    /* export enum H1 {
        x0 = 0x0, x1 = 0x1, x2 = 0x2, x3 = 0x3, x4 = 0x4, x5 = 0x5, x6 = 0x6, x7 = 0x7,
        x8 = 0x8, x9 = 0x9, xA = 0xA, xB = 0xB, xC = 0xC, xD = 0xD, xE = 0xE, xF = 0xF
    } */
    export enum H2 {
        x00 = 0x00, /*x10 = 0x10, x20 = 0x20, x30 = 0x30, x40 = 0x40, x50 = 0x50, x60 = 0x60, x70 = 0x70,*/
        x80 = 0x80 /*, x90 = 0x90, xA0 = 0xA0, xB0 = 0xB0, xC0 = 0xC0, xD0 = 0xD0, xE0 = 0xE0, xF0 = 0xF0*/
    }
    export enum H3 {
        x000 = 0x000, x100 = 0x100, x200 = 0x200, x300 = 0x300, x400 = 0x400, x500 = 0x500, x600 = 0x600, x700 = 0x700,
        x800 = 0x800, x900 = 0x900, xA00 = 0xA00, xB00 = 0xB00, xC00 = 0xC00, xD00 = 0xD00, xE00 = 0xE00, xF00 = 0xF00
    }
    export enum H4 {
        x0000 = 0x0000, x1000 = 0x1000, x2000 = 0x2000, x3000 = 0x3000, x4000 = 0x4000, x5000 = 0x5000, x6000 = 0x6000, x7000 = 0x7000,
        x8000 = 0x8000, x9000 = 0x9000, xA000 = 0xA000, xB000 = 0xB000, xC000 = 0xC000, xD000 = 0xD000, xE000 = 0xE000, xF000 = 0xF000
    }

    /* function log(r: number, c: number, e: number, pText: string) {
        lcd16x2rgb.writeText(lcd16x2rgb.eADDR_LCD.LCD_16x2, r, c, e, lcd16x2rgb.eAlign.left, pText)
    } */

    // aus Python
    function sleep(pSekunden: number) { control.waitMicros(pSekunden * 1000000) }

    // ========== group="i2c Adressen"

    //% blockId=eeprom_eADDR
    //% group="i2c Adressen" advanced=true
    //% block="%pADDR" weight=4
    export function eeprom_eADDR(pADDR: eADDR): number { return pADDR }


    //% group="i2c Adressen" advanced=true
    //% block="i2c Fehlercode" weight=2
    export function i2cError() { return n_i2cError }

    function i2cWriteBuffer(pADDR: number, buf: Buffer, repeat: boolean = false) {
        if (n_i2cError == 0) { // vorher kein Fehler
            n_i2cError = pins.i2cWriteBuffer(pADDR, buf, repeat)
            if (n_i2cCheck && n_i2cError != 0)  // vorher kein Fehler, wenn (n_i2cCheck=true): beim 1. Fehler anzeigen
                basic.showString(Buffer.fromArray([pADDR]).toHex()) // zeige fehlerhafte i2c-Adresse als HEX
        } else if (!n_i2cCheck)  // vorher Fehler, aber ignorieren (n_i2cCheck=false): i2c weiter versuchen
            n_i2cError = pins.i2cWriteBuffer(pADDR, buf, repeat)
        //else { } // n_i2cCheck=true und n_i2cError != 0: weitere i2c Aufrufe blockieren
    }

    function i2cReadBuffer(pADDR: number, size: number, repeat: boolean = false): Buffer {
        if (!n_i2cCheck || n_i2cError == 0)
            return pins.i2cReadBuffer(pADDR, size, repeat)
        else
            return Buffer.create(size)
    }

} // eeprom.ts
